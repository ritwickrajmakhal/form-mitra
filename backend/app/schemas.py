from pydantic import BaseModel, Field

class MessageItem(BaseModel):
    role: str = Field(..., description="'user', 'assistant', or 'tool'")
    content: str | None = Field(None, description="The text content")
    image: str | None = Field(None, description="Optional base64 image data URL (data:image/...)")
    tool_call_id: str | None = Field(None, description="The tool call ID for tool response messages")
    tool_calls: list[dict] | None = Field(None, description="Optional tool calls request from assistant")

class ChatRequest(BaseModel):
    messages: list[MessageItem] | None = Field(None, description="The conversation history messages")
    message: str | None = Field(None, description="Legacy single message query")
    image: str | None = Field(None, description="Legacy single image attachment")
    session_id: str | None = Field(None, description="The session ID for storing/retrieving chat history")

class ChatResponse(BaseModel):
    response: str = Field(..., description="The response text from the agent")
    session_id: str = Field("stateless", description="A placeholder session ID")
    tool_calls: list[dict] | None = Field(None, description="List of tool calls required by the agent")
