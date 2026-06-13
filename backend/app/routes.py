from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
import logging
import json
import uuid
import os
import shutil
import tempfile
from typing import List
from datetime import datetime
from app.schemas import ChatRequest
from app.client import azure_client_manager
from app.services import intent_router, local_form_filler_agent
from app.db import (
    create_session,
    save_message,
    save_attachment,
    get_sessions,
    get_session_messages,
    delete_session
)

logger = logging.getLogger("app.routes")

router = APIRouter()

@router.get("/sessions")
def read_sessions():
    try:
        return get_sessions()
    except Exception as e:
        logger.error(f"Error fetching sessions: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/session/{session_id}")
def read_session_messages(session_id: str):
    try:
        messages = get_session_messages(session_id)
        # Format dates if needed or just return raw
        return {"session_id": session_id, "messages": messages}
    except Exception as e:
        logger.error(f"Error fetching session messages: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/session/{session_id}")
def remove_session(session_id: str):
    try:
        delete_session(session_id)
        return {"status": "success", "message": f"Session {session_id} deleted"}
    except Exception as e:
        logger.error(f"Error deleting session: {e}")
        raise HTTPException(status_code=500, detail=str(e))

_easyocr_reader = None

def get_easyocr_reader():
    global _easyocr_reader
    if _easyocr_reader is None:
        import easyocr
        logger.info("Initializing EasyOCR Reader (CPU mode)...")
        _easyocr_reader = easyocr.Reader(['en'], gpu=False)
    return _easyocr_reader

@router.post("/upload/{session_id}")
async def upload_documents(session_id: str, files: List[UploadFile] = File(...)):
    try:
        # Create directory at backend/uploads/session-id/
        upload_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "uploads", session_id)
        os.makedirs(upload_dir, exist_ok=True)
        
        extracted_results = []
        
        for file in files:
            if not file.filename:
                continue
                
            file_path = os.path.join(upload_dir, file.filename)
            
            # Read and save file content
            content = await file.read()
            with open(file_path, "wb") as f:
                f.write(content)
                
            filesize = len(content)
            # Infer file extension or content_type
            filetype = file.content_type or file.filename.split(".")[-1]
            
            extracted_text = ""
            
            # Extract text based on file type
            if file.filename.lower().endswith(".pdf"):
                try:
                    from pypdf import PdfReader
                    reader = PdfReader(file_path)
                    text_parts = []
                    for page in reader.pages:
                        page_text = page.extract_text()
                        if page_text:
                            text_parts.append(page_text)
                    extracted_text = "\n".join(text_parts).strip()
                except Exception as pdf_err:
                    logger.error(f"Failed to extract text from PDF {file.filename}: {pdf_err}")
                    extracted_text = ""
            elif file.filename.lower().endswith((".png", ".jpg", ".jpeg")):
                try:
                    reader = get_easyocr_reader()
                    result = reader.readtext(file_path, detail=0)
                    extracted_text = " ".join(result).strip()
                except Exception as ocr_err:
                    logger.error(f"Failed to OCR image {file.filename}: {ocr_err}")
                    extracted_text = ""
            else:
                # Text files
                try:
                    extracted_text = content.decode("utf-8", errors="ignore").strip()
                except Exception:
                    extracted_text = ""
            
            # Handle empty/passport photo logic
            is_image = file.filename.lower().endswith((".png", ".jpg", ".jpeg"))
            if is_image and not extracted_text:
                extracted_text = "Passport size photo"
            elif not extracted_text:
                extracted_text = "No text extracted"
                
            # Keep track of result
            item = {
                "filename": file.filename,
                "filesize": filesize,
                "extracted_text": extracted_text,
                "filetype": filetype
            }
            extracted_results.append(item)
            
        # Create a user message in DB representing the upload
        upload_msg_id = str(uuid.uuid4())
        filenames_str = ", ".join([r["filename"] for r in extracted_results])
        save_message(
            upload_msg_id,
            session_id,
            "user",
            f"Uploaded attachments: {filenames_str}",
            datetime.utcnow().isoformat()
        )
        
        # Save attachment references in DB
        for r in extracted_results:
            save_attachment(
                upload_msg_id,
                r["filename"],
                r["filesize"],
                f"/uploads/{session_id}/{r['filename']}"
            )
            
        # Print data to a temp file
        temp_fd, temp_file_path = tempfile.mkstemp(suffix=".json", prefix="ocr_extracted_")
        with os.fdopen(temp_fd, 'w') as temp_file:
            json.dump(extracted_results, temp_file, indent=2)
            
        logger.info(f"Extracted data printed to temp file: {temp_file_path}")
        print(f"Extracted data printed to temp file: {temp_file_path}")
        
        return {
            "status": "success",
            "temp_file": temp_file_path,
            "data": extracted_results
        }
        
    except Exception as e:
        logger.error(f"Error handling file upload: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/chat")
async def handle_chat(payload: ChatRequest):
    # Ensure Azure client is initialized
    try:
        azure_client_manager.initialize()
    except Exception as e:
        logger.error(f"Failed to initialize Azure AI Client: {e}")
        raise HTTPException(status_code=500, detail=f"Azure Client error: {str(e)}")
        
    try:
        openai_client = azure_client_manager.get_openai_client()
        
        # 1. Determine or generate session ID
        session_id = payload.session_id
        is_new_session = False
        if not session_id:
            session_id = str(uuid.uuid4())
            is_new_session = True

        # Determine user query
        last_user_message = ""
        if payload.messages:
            for m in reversed(payload.messages):
                if m.role == "user" and m.content:
                    last_user_message = m.content
                    break
        if not last_user_message:
            last_user_message = payload.message or ""

        # Determine user image (if any)
        last_user_image = None
        if payload.messages:
            for m in reversed(payload.messages):
                if m.role == "user" and m.image:
                    last_user_image = m.image
                    break
        if not last_user_image:
            last_user_image = payload.image

        # If it's a new session or we need to save the new user message
        if is_new_session:
            # Generate title from message or default
            title = last_user_message.strip()[:30] + "..." if len(last_user_message.strip()) > 30 else (last_user_message.strip() or "Form Analysis")
            create_session(session_id, title)

        # Save user message to database
        user_msg_id = str(uuid.uuid4())
        save_message(
            user_msg_id,
            session_id,
            "user",
            last_user_message,
            datetime.utcnow().isoformat()
        )

        # Save user attachment (if image present)
        if last_user_image:
            save_attachment(
                user_msg_id,
                "Screenshot.png",
                None,
                last_user_image
            )

        # 2. Build the input messages array from SQLite history
        db_messages = get_session_messages(session_id)
        input_messages = []
        for msg in db_messages:
            if msg["role"] == "assistant":
                item = {"role": "assistant"}
                if msg["content"]:
                    item["content"] = msg["content"]
                input_messages.append(item)
            else:
                # user message content
                attachments = msg.get("attachments", [])
                image_data_url = None
                for att in attachments:
                    if att["data_url"] and att.get("data_url").startswith("data:image/"):
                        image_data_url = att["data_url"]
                        break
                
                if image_data_url:
                    content = [
                        {"type": "input_text", "text": msg["content"] or ""},
                        {"type": "input_image", "image_url": image_data_url}
                    ]
                else:
                    content = msg["content"] or ""
                    
                input_messages.append({
                    "role": "user",
                    "content": content
                })

        # Route the request using the last user query
        intent = intent_router.classify_intent(last_user_message)
        logger.info(f"Routed request intent: '{intent}'")

        if intent == "FILL":
            logger.info("Routing request to local Phi-4 Agent via Agent Framework")
            async def local_event_generator():
                try:
                    # Yield session_created event first
                    yield f"data: {json.dumps({'type': 'session_created', 'session_id': session_id})}\n\n"
                    
                    assistant_text = ""
                    # Retrieve stream from local agent-framework agent
                    async for update in local_form_filler_agent.run(last_user_message, stream=True):
                        if update.text:
                            assistant_text += update.text
                            data = {"type": "text_delta", "text": update.text}
                            yield f"data: {json.dumps(data)}\n\n"
                            
                    # Save assistant message to SQLite
                    save_message(
                        str(uuid.uuid4()),
                        session_id,
                        "assistant",
                        assistant_text,
                        datetime.utcnow().isoformat()
                    )
                    yield f"data: {json.dumps({'type': 'done'})}\n\n"
                except Exception as stream_err:
                    logger.error(f"Error in local event stream generation: {stream_err}")
                    yield f"data: {json.dumps({'type': 'error', 'message': str(stream_err)})}\n\n"

            return StreamingResponse(local_event_generator(), media_type="text/event-stream")
            
        logger.info(f"Streaming chat request to remote responses API with {len(input_messages)} messages")
        
        def remote_event_generator():
            try:
                # Yield session_created event first
                yield f"data: {json.dumps({'type': 'session_created', 'session_id': session_id})}\n\n"

                # Call responses API with stream=True
                response_stream = openai_client.responses.create(
                    input=input_messages,
                    stream=True
                )
                
                assistant_text = ""
                for chunk in response_stream:
                    # 1. Output text delta chunk
                    if chunk.type == "response.output_text.delta":
                        assistant_text += chunk.delta
                        data = {"type": "text_delta", "text": chunk.delta}
                        yield f"data: {json.dumps(data)}\n\n"
                    
                    # 2. Annotation added event
                    elif chunk.type == "response.output_text.annotation.added":
                        ann = chunk.annotation
                        annotation_dict = {}
                        if hasattr(ann, "model_dump"):
                          annotation_dict = ann.model_dump()
                        elif hasattr(ann, "dict"):
                          annotation_dict = ann.dict()
                        elif hasattr(ann, "__dict__"):
                          annotation_dict = {k: v for k, v in ann.__dict__.items() if not k.startswith('_')}
                        else:
                          annotation_dict = dict(ann)
                            
                        # Add chunk level properties for marker matching
                        annotation_dict["output_index"] = getattr(chunk, "output_index", 0)
                        annotation_dict["annotation_index"] = getattr(chunk, "annotation_index", 0)
                        
                        data = {"type": "annotation", "annotation": annotation_dict}
                        yield f"data: {json.dumps(data)}\n\n"
                    
                    # 3. Done event
                    elif chunk.type == "response.done":
                        break

                # Save assistant message to SQLite
                save_message(
                    str(uuid.uuid4()),
                    session_id,
                    "assistant",
                    assistant_text,
                    datetime.utcnow().isoformat()
                )
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
            except Exception as stream_err:
                logger.error(f"Error in remote event stream generation: {stream_err}")
                yield f"data: {json.dumps({'type': 'error', 'message': str(stream_err)})}\n\n"

        return StreamingResponse(remote_event_generator(), media_type="text/event-stream")
        
    except Exception as e:
        logger.error(f"Error calling responses API stream: {e}")
        raise HTTPException(status_code=500, detail=f"Agent response stream error: {str(e)}")
