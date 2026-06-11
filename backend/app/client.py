import logging
from azure.identity import DefaultAzureCredential
from azure.ai.projects import AIProjectClient
from azure.ai.projects.models import VersionRefIndicator
from app.config import settings

logger = logging.getLogger("app.client")

class AzureAIClientManager:
    def __init__(self):
        self.project_client = None
        self.credential = None
        self.agent_version = None

    def initialize(self):
        if self.project_client is not None:
            return

        endpoint = settings.get_project_endpoint()
        logger.info(f"Initializing AIProjectClient with endpoint: {endpoint}")
        
        self.credential = DefaultAzureCredential()
        self.project_client = AIProjectClient(
            endpoint=endpoint,
            credential=self.credential,
            allow_preview=True
        )
        
        # Resolve agent version
        if settings.azure_ai_agent_version:
            self.agent_version = settings.azure_ai_agent_version
            logger.info(f"Using configured agent version: {self.agent_version}")
        else:
            try:
                agent = self.project_client.agents.get(agent_name=settings.azure_ai_agent_name)
                available_versions = list(agent.versions.keys()) if hasattr(agent, 'versions') else []
                logger.info(f"Available agent versions: {available_versions}")
                self.agent_version = agent.versions["latest"].version
                logger.info(f"Resolved latest agent version at runtime: {self.agent_version}")
            except Exception as e:
                logger.error(f"Failed to query latest agent version at runtime: {e}")
                self.agent_version = "latest"  # Fallback

    def get_openai_client(self):
        if not self.project_client:
            self.initialize()
        return self.project_client.get_openai_client(agent_name=settings.azure_ai_agent_name)

    def create_session(self):
        if not self.project_client:
            self.initialize()
            
        version = settings.azure_ai_agent_version or "latest"
        logger.info(f"Creating session with version indicator: {version}")
        try:
            return self.project_client.beta.agents.create_session(
                agent_name=settings.azure_ai_agent_name,
                version_indicator=VersionRefIndicator(agent_version=version)
            )
        except Exception as e:
            error_str = str(e)
            if "agent_version_not_ready" in error_str or "provisioned" in error_str:
                logger.warning(f"Target agent version '{version}' is not ready yet: {e}. Attempting fallback to previous version...")
                try:
                    versions = self.project_client.agents.list_versions(agent_name=settings.azure_ai_agent_name)
                    
                    # Sort version strings numerically in descending order
                    def get_version_val(v):
                        try:
                            return int(v.version)
                        except ValueError:
                            return -1
                            
                    sorted_versions = sorted(versions, key=get_version_val, reverse=True)
                    
                    # Try to find the first working older version
                    for v in sorted_versions:
                        # Skip version 2 (or whatever resolved latest version failed)
                        if v.version == self.agent_version or v.version == "2":
                            continue
                        try:
                            logger.info(f"Attempting fallback session creation with version: {v.version}")
                            return self.project_client.beta.agents.create_session(
                                agent_name=settings.azure_ai_agent_name,
                                version_indicator=VersionRefIndicator(agent_version=v.version)
                            )
                        except Exception as fallback_err:
                            logger.warning(f"Fallback to version {v.version} failed: {fallback_err}")
                except Exception as list_err:
                    logger.error(f"Failed to retrieve versions for fallback: {list_err}")
            
            # If fallback is not applicable or all fallbacks fail, re-raise the original error
            raise e

    def delete_session(self, session_id: str):
        if not self.project_client:
            return
        self.project_client.beta.agents.delete_session(
            agent_name=settings.azure_ai_agent_name,
            session_id=session_id
        )

    def close(self):
        if self.project_client:
            try:
                self.project_client.close()
            except Exception as e:
                logger.warning(f"Error closing project client: {e}")
            self.project_client = None
            
        if self.credential:
            try:
                self.credential.close()
            except Exception as e:
                logger.warning(f"Error closing credentials: {e}")
            self.credential = None

azure_client_manager = AzureAIClientManager()
