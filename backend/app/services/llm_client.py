"""
LLM client wrapper — OpenAI-compatible (DeepSeek, OpenAI, etc.).
Async generation with error handling and fast-fail on fatal errors.
"""

import logging
import asyncio
from typing import Optional

logger = logging.getLogger(__name__)


class LLMClient:
    """Async wrapper around OpenAI-compatible chat completions."""

    def __init__(self, api_key: str, model: str = "deepseek-chat", base_url: str = ""):
        self.model = model
        self._client = None
        self._api_key = api_key
        self._base_url = base_url or None

    def _get_client(self):
        if self._client is None:
            from openai import OpenAI
            kwargs = {"api_key": self._api_key}
            if self._base_url:
                kwargs["base_url"] = self._base_url
            self._client = OpenAI(**kwargs)
        return self._client

    async def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        temperature: float = 0.3,
        max_tokens: int = 3000,
        retries: int = 2,
    ) -> str:
        client = self._get_client()

        for attempt in range(retries + 1):
            try:
                response = await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: client.chat.completions.create(
                        model=self.model,
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt},
                        ],
                        temperature=temperature,
                        max_tokens=max_tokens,
                    ),
                )
                content = response.choices[0].message.content or ""
                logger.info(
                    "LLM response: model=%s, tokens_in=%s, tokens_out=%s",
                    self.model,
                    response.usage.prompt_tokens if response.usage else "?",
                    response.usage.completion_tokens if response.usage else "?",
                )
                return content

            except Exception as e:
                logger.warning("LLM attempt %d failed: %s", attempt + 1, e)
                err_str = str(e).lower()
                fatal = any(k in err_str for k in (
                    "401", "403", "invalid_api_key", "unsupported_country",
                    "authentication", "insufficient_quota",
                ))
                if fatal or attempt >= retries:
                    logger.error("LLM error (fatal=%s): %s", fatal, e)
                    raise
                await asyncio.sleep(1.5 * (attempt + 1))

        raise RuntimeError("LLM retries exhausted")


_instance: Optional[LLMClient] = None


def get_llm_client() -> LLMClient:
    global _instance
    if _instance is None:
        from app.config import settings
        _instance = LLMClient(
            api_key=settings.openai_api_key,
            model=settings.ai_model,
            base_url=settings.openai_base_url,
        )
    return _instance
