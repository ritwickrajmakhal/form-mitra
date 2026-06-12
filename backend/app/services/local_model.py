import os
import logging
from huggingface_hub import snapshot_download
import onnxruntime_genai as og
from app.config import settings

logger = logging.getLogger("app.services.local_model")

import ctypes
from ctypes import wintypes

# Define DXGI helper structures for GPU detection
class LUID(ctypes.Structure):
    _fields_ = [
        ("LowPart", wintypes.DWORD),
        ("HighPart", wintypes.LONG),
    ]

class DXGI_ADAPTER_DESC(ctypes.Structure):
    _fields_ = [
        ("Description", ctypes.c_wchar * 128),
        ("VendorId", wintypes.UINT),
        ("DeviceId", wintypes.UINT),
        ("SubSysId", wintypes.UINT),
        ("Revision", wintypes.UINT),
        ("DedicatedVideoMemory", ctypes.c_size_t),
        ("DedicatedSystemMemory", ctypes.c_size_t),
        ("SharedSystemMemory", ctypes.c_size_t),
        ("AdapterLuid", LUID),
    ]

class GUID(ctypes.Structure):
    _fields_ = [("Data", ctypes.c_char * 16)]

# IID_IDXGIFactory: {7b7166ec-21c7-44ae-b21a-c9ae321ae369}
IID_IDXGIFactory = GUID(b'\xec\x66\x71\x7b\xc7\x21\xae\x44\xb2\x1a\xc9\xae\x32\x1a\xe3\x69')
DXGI_ERROR_NOT_FOUND = -2185273342
S_OK = 0

def get_dxgi_adapters():
    if os.name != 'nt':
        return []
    adapters = []
    try:
        dxgi = ctypes.windll.dxgi
        dxgi.CreateDXGIFactory.argtypes = [ctypes.POINTER(GUID), ctypes.POINTER(ctypes.c_void_p)]
        dxgi.CreateDXGIFactory.restype = ctypes.c_long
        
        pFactory = ctypes.c_void_p()
        hr = dxgi.CreateDXGIFactory(ctypes.byref(IID_IDXGIFactory), ctypes.byref(pFactory))
        if hr != S_OK:
            return adapters
            
        vtable_factory = ctypes.cast(pFactory, ctypes.POINTER(ctypes.c_void_p))
        vtable = ctypes.cast(vtable_factory[0], ctypes.POINTER(ctypes.c_void_p))
        
        # EnumAdapters: index 7
        EnumAdapters_proto = ctypes.WINFUNCTYPE(ctypes.c_long, ctypes.c_void_p, wintypes.UINT, ctypes.POINTER(ctypes.c_void_p))
        EnumAdapters = EnumAdapters_proto(vtable[7])
        
        # Release: index 2
        Release_proto = ctypes.WINFUNCTYPE(wintypes.ULONG, ctypes.c_void_p)
        ReleaseFactory = Release_proto(vtable[2])
        
        i = 0
        while True:
            pAdapter = ctypes.c_void_p()
            hr_enum = EnumAdapters(pFactory, i, ctypes.byref(pAdapter))
            if hr_enum == DXGI_ERROR_NOT_FOUND:
                break
            elif hr_enum != S_OK:
                break
                
            vtable_adapter = ctypes.cast(pAdapter, ctypes.POINTER(ctypes.c_void_p))
            vtable_ad = ctypes.cast(vtable_adapter[0], ctypes.POINTER(ctypes.c_void_p))
            
            # GetDesc: index 8
            GetDesc_proto = ctypes.WINFUNCTYPE(ctypes.c_long, ctypes.c_void_p, ctypes.POINTER(DXGI_ADAPTER_DESC))
            GetDesc = GetDesc_proto(vtable_ad[8])
            ReleaseAdapter = Release_proto(vtable_ad[2])
            
            desc = DXGI_ADAPTER_DESC()
            if GetDesc(pAdapter, ctypes.byref(desc)) == S_OK:
                adapters.append({
                    "index": i,
                    "description": desc.Description,
                    "vendor_id": desc.VendorId,
                    "device_id": desc.DeviceId,
                    "dedicated_video_memory": desc.DedicatedVideoMemory,
                })
            
            ReleaseAdapter(pAdapter)
            i += 1
            
        ReleaseFactory(pFactory)
    except Exception as e:
        logger.warning(f"Failed to enumerate DXGI adapters via ctypes: {e}")
    return adapters

class LocalModelService:
    def __init__(self):
        self.model = None
        self.tokenizer = None
        self.model_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            settings.local_model_path
        )
        # Target specific GPU subfolder containing ONNX weights
        self.gpu_model_path = os.path.join(self.model_dir, "gpu", "gpu-int4-rtn-block-32")

    def download_if_needed(self):
        # We check for the presence of the model directory and model weights file
        # The typical onnx model directory will contain model.onnx or multiple files.
        if not os.path.exists(self.gpu_model_path) or not os.listdir(self.gpu_model_path):
            logger.info("Local model not found. Downloading Phi-4-mini-instruct-onnx from Hugging Face...")
            os.makedirs(self.model_dir, exist_ok=True)
            snapshot_download(
                repo_id="microsoft/Phi-4-mini-instruct-onnx",
                allow_patterns=["gpu/gpu-int4-rtn-block-32/*"],
                local_dir=self.model_dir,
                local_dir_use_symlinks=False
            )
            logger.info("Download completed successfully.")
        else:
            logger.info("Local model found. Skipping download.")

    def select_best_device(self):
        adapters = get_dxgi_adapters()
        dgpus = []
        igpus = []
        
        for a in adapters:
            if a["vendor_id"] == 0x1414:  # Microsoft Basic Render Driver (Software)
                continue
            # Treat GPUs with >= 2 GB dedicated memory as discrete (dGPU)
            if a["dedicated_video_memory"] >= 2 * 1024 * 1024 * 1024:
                dgpus.append(a)
            else:
                igpus.append(a)
                
        if dgpus:
            return "dml", dgpus[0]["index"], dgpus[0]["description"]
        elif igpus:
            return "dml", igpus[0]["index"], igpus[0]["description"]
        else:
            return "cpu", None, "CPU"

    def initialize(self):
        if self.model is not None:
            return

        if settings.download_local_model:
            self.download_if_needed()

        logger.info(f"Loading local ONNX model from: {self.gpu_model_path}")
        try:
            # 1. Check if user configured an explicit override
            if settings.local_model_gpu_device_id is not None:
                logger.info(f"Using explicitly configured GPU device ID: {settings.local_model_gpu_device_id}")
                config = og.Config(self.gpu_model_path)
                config.set_provider_option("dml", "device_id", str(settings.local_model_gpu_device_id))
                self.model = og.Model(config)
            else:
                # 2. Dynamically select the best device based on system configuration
                provider, device_id, device_name = self.select_best_device()
                if provider == "dml":
                    logger.info(f"Dynamically selected GPU: {device_name} (device ID: {device_id})")
                    config = og.Config(self.gpu_model_path)
                    config.set_provider_option("dml", "device_id", str(device_id))
                    self.model = og.Model(config)
                else:
                    logger.info("No physical GPUs detected. Falling back to CPU.")
                    config = og.Config(self.gpu_model_path)
                    config.clear_providers()
                    self.model = og.Model(config)
            self.tokenizer = og.Tokenizer(self.model)
            logger.info("Local ONNX model loaded successfully.")
        except Exception as e:
            logger.error(f"Failed to initialize model on preferred device, attempting CPU fallback: {e}")
            try:
                config = og.Config(self.gpu_model_path)
                config.clear_providers()
                self.model = og.Model(config)
                self.tokenizer = og.Tokenizer(self.model)
                logger.info("Local ONNX model loaded successfully on CPU fallback.")
            except Exception as cpu_err:
                logger.error(f"Failed to load ONNX model even on CPU fallback: {cpu_err}")
                raise cpu_err

    def generate_stream(self, system_prompt: str, prompt: str, max_new_tokens: int = 2048):
        if self.model is None:
            self.initialize()

        # Format according to Phi-4 chat template
        formatted_prompt = f"<|system|>\n{system_prompt}\n<|end|>\n<|user|>\n{prompt}\n<|end|>\n<|assistant|>\n"
        
        input_tokens = self.tokenizer.encode(formatted_prompt)
        params = og.GeneratorParams(self.model)
        params.set_search_options(max_length=len(input_tokens) + max_new_tokens)

        generator = og.Generator(self.model, params)
        generator.append_tokens(input_tokens)
        
        while not generator.is_done():
            generator.generate_next_token()
            new_tokens = generator.get_next_tokens()
            if new_tokens:
                word = self.tokenizer.decode(new_tokens)
                yield word

local_model_service = LocalModelService()

import asyncio
from typing import Sequence, Mapping, Any, Awaitable
from agent_framework import BaseChatClient, ChatResponse, Message, ChatResponseUpdate, Agent, Content, ResponseStream

class LocalONNXChatClient(BaseChatClient):
    def __init__(self, model_service):
        super().__init__()
        self.model_service = model_service

    def _inner_get_response(
        self,
        *,
        messages: Sequence[Message],
        stream: bool = False,
        options: Mapping[str, Any] = None,
        **kwargs: Any
    ) -> Awaitable[ChatResponse] | ResponseStream[ChatResponseUpdate, ChatResponse]:
        
        system_prompt = "You are Form Mitra, an intelligent local form filling assistant. Help the user fill out fields based on their documents."
        prompt = ""
        for msg in messages:
            if msg.role == "system":
                system_prompt = msg.text or system_prompt
                continue
            prompt += f"<|{msg.role}|>\n{msg.text}\n<|end|>\n"
            
        if stream:
            async def _get_stream():
                def run_stream():
                    return self.model_service.generate_stream(system_prompt=system_prompt, prompt=prompt)

                loop = asyncio.get_event_loop()
                model_stream = await loop.run_in_executor(None, run_stream)

                def next_chunk(gen):
                    try:
                        return next(gen), False
                    except StopIteration:
                        return None, True

                while True:
                    chunk, done = await loop.run_in_executor(None, next_chunk, model_stream)
                    if done:
                        break
                    yield ChatResponseUpdate(
                        role="assistant",
                        contents=[Content(type="text", text=chunk)]
                    )

            def finalize(updates: Sequence[ChatResponseUpdate]) -> ChatResponse:
                text = "".join(u.text for u in updates if u.text)
                return ChatResponse(
                    messages=[Message(role="assistant", contents=[text])],
                    response_id="local-onnx-response"
                )

            return ResponseStream(stream=_get_stream(), finalizer=finalize)

        else:
            async def _get_response() -> ChatResponse:
                def run_gen():
                    stream = self.model_service.generate_stream(system_prompt=system_prompt, prompt=prompt)
                    return "".join(list(stream))

                response_text = await asyncio.to_thread(run_gen)
                return ChatResponse(
                    messages=[Message(role="assistant", contents=[response_text])],
                    response_id="local-onnx-response"
                )

            return _get_response()

local_chat_client = LocalONNXChatClient(local_model_service)

local_form_filler_agent = Agent(
    name="LocalFormFillerAgent",
    instructions="You are Form Mitra, an intelligent local form filling assistant. Help the user fill out fields based on their documents.",
    client=local_chat_client
)



