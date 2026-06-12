import logging
from app.services.local_model import local_model_service

logger = logging.getLogger("app.services.router")

ROUTER_SYSTEM_PROMPT = """You are an intent routing assistant for Form Mitra.
Analyze the user's input and determine if their request is:
- 'ANALYZE': Scanning a form, analyzing fields, visual form review, document recommendations, or initial form planning.
- 'FILL': Filling out the form, inserting data, generating autofill options, or executing form filling actions.

Respond with exactly one word: ANALYZE or FILL. Do not output anything else.
"""

class LocalIntentRouter:
    def classify_intent(self, user_message: str) -> str:
        logger.info(f"Classifying intent for user message: {user_message[:50]}...")
        try:
            # Call local model synchronously/sequentially for classification
            result_stream = local_model_service.generate_stream(
                system_prompt=ROUTER_SYSTEM_PROMPT,
                prompt=user_message,
                max_new_tokens=64
            )
            response = "".join(list(result_stream)).strip().upper()
            logger.info(f"Router classification response: '{response}'")
            if "FILL" in response:
                return "FILL"
            return "ANALYZE"  # Default fallback is Remote analysis agent
        except Exception as e:
            logger.error(f"Failed to route message using local model: {e}. Defaulting to ANALYZE.")
            return "ANALYZE"

intent_router = LocalIntentRouter()
