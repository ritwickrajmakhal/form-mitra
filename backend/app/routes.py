from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import logging
import json
from app.schemas import ChatRequest
from app.client import azure_client_manager

logger = logging.getLogger("app.routes")

router = APIRouter()

@router.post("/chat")
def handle_chat(payload: ChatRequest):
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
            
        logger.info(f"Streaming chat request to responses API with {len(input_messages)} messages")
        
        def event_generator():
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
                    
                    # 2. Done event
                    elif chunk.type == "response.done":
                        yield f"data: {json.dumps({'type': 'done'})}\n\n"
                        break
            except Exception as stream_err:
                logger.error(f"Error in event stream generation: {stream_err}")
                yield f"data: {json.dumps({'type': 'error', 'message': str(stream_err)})}\n\n"

        return StreamingResponse(event_generator(), media_type="text/event-stream")
        
    except Exception as e:
        logger.error(f"Error calling responses API stream: {e}")
        raise HTTPException(status_code=500, detail=f"Agent response stream error: {str(e)}")

@router.delete("/session/{session_id}")
def delete_session(session_id: str):
    logger.info(f"Delete session request for '{session_id}' (stateless no-op)")
    return {"status": "success", "message": "Stateless session - no-op"}
