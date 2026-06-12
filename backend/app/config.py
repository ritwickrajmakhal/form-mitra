import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    agent_endpoint: str | None = None
    azure_ai_project_endpoint: str | None = None
    azure_ai_agent_name: str = "form-mitra"
    azure_ai_agent_version: str = ""
    azure_ai_isolation_key: str = "my-isolation-key"
    local_model_path: str = "models/Phi-4-mini-instruct-onnx"
    download_local_model: bool = True
    local_model_gpu_device_id: int | None = None
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        env_prefix="",
        case_sensitive=False
    )
    
    def get_project_endpoint(self) -> str:
        if self.azure_ai_project_endpoint:
            return self.azure_ai_project_endpoint
        if self.agent_endpoint:
            # Parse project endpoint from agent_endpoint if needed
            # e.g., https://form-mitra-resource.services.ai.azure.com/api/projects/form-mitra/agents/form-mitra/endpoint/protocols/openai/responses
            if "/agents/" in self.agent_endpoint:
                return self.agent_endpoint.split("/agents/")[0]
            return self.agent_endpoint
        # Default fallback if nothing is configured
        return "https://form-mitra-resource.services.ai.azure.com/api/projects/form-mitra"

settings = Settings()
