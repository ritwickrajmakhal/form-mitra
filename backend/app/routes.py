from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import logging
import json
from app.schemas import ChatRequest
from app.client import azure_client_manager
from app.services import intent_router, local_form_filler_agent

logger = logging.getLogger("app.routes")

router = APIRouter()

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
        
        # Build the input messages array in standard format
        input_messages = []
        
        # 1. Check if messages history is provided
        if payload.messages is not None:
            for msg in payload.messages:
                # Format according to role
                if msg.role == "assistant":
                    # Assistant message
                    item = {"role": "assistant"}
                    if msg.content:
                        item["content"] = msg.content
                    input_messages.append(item)
                else:
                    # User message
                    if msg.image:
                        content = [
                            {"type": "input_text", "text": msg.content or ""},
                            {"type": "input_image", "image_url": msg.image}
                        ]
                    else:
                        content = msg.content
                        
                    input_messages.append({
                        "role": "user",
                        "content": content
                    })
        else:
            # 2. Backward compatibility: Fall back to single message/image payload
            legacy_text = payload.message or ""
            legacy_image = payload.image
            
            if legacy_image:
                content = [
                    {"type": "input_text", "text": legacy_text},
                    {"type": "input_image", "image_url": legacy_image}
                ]
            else:
                content = legacy_text
                
            input_messages.append({
                "role": "user",
                "content": content
            })

        # Determine the last user query to route intent
        last_user_message = ""
        if payload.messages:
            # Look for the last user message in history
            for m in reversed(payload.messages):
                if m.role == "user" and m.content:
                    last_user_message = m.content
                    break
        if not last_user_message:
            last_user_message = payload.message or ""

        # Route the request
        intent = intent_router.classify_intent(last_user_message)
        logger.info(f"Routed request intent: '{intent}'")

        if intent == "FILL":
            logger.info("Routing request to local Phi-4 Agent via Agent Framework")
            async def local_event_generator():
                try:
                    # Retrieve stream from local agent-framework agent
                    async for update in local_form_filler_agent.run(last_user_message, stream=True):
                        if update.text:
                            data = {"type": "text_delta", "text": update.text}
                            yield f"data: {json.dumps(data)}\n\n"
                    yield f"data: {json.dumps({'type': 'done'})}\n\n"
                except Exception as stream_err:
                    logger.error(f"Error in local event stream generation: {stream_err}")
                    yield f"data: {json.dumps({'type': 'error', 'message': str(stream_err)})}\n\n"

            return StreamingResponse(local_event_generator(), media_type="text/event-stream")
            
        logger.info(f"Streaming chat request to remote responses API with {len(input_messages)} messages")
        
        def remote_event_generator():
            try:
                # Call responses API with stream=True
                response_stream = openai_client.responses.create(
                    input=input_messages,
                    stream=True
                )
                
                for chunk in response_stream:

                    # 1. Output text delta chunk
                    if chunk.type == "response.output_text.delta":
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
                        yield f"data: {json.dumps({'type': 'done'})}\n\n"
                        break
            except Exception as stream_err:
                logger.error(f"Error in remote event stream generation: {stream_err}")
                yield f"data: {json.dumps({'type': 'error', 'message': str(stream_err)})}\n\n"

        return StreamingResponse(remote_event_generator(), media_type="text/event-stream")
        
    except Exception as e:
        logger.error(f"Error calling responses API stream: {e}")
        raise HTTPException(status_code=500, detail=f"Agent response stream error: {str(e)}")


@router.delete("/session/{session_id}")
def delete_session(session_id: str):
    logger.info(f"Delete session request for '{session_id}' (stateless no-op)")
    return {"status": "success", "message": "Stateless session - no-op"}
