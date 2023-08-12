import openai as original_openai
from openai.openai_object import OpenAIObject
import time
import inspect

from openpipe.merge_openai_chunks import merge_streamed_chunks

from .shared import maybe_check_cache, maybe_check_cache_async, report_async, report


class WrappedChatCompletion(original_openai.ChatCompletion):
    @classmethod
    def create(cls, *args, **kwargs):
        openpipe_options = kwargs.pop("openpipe", {})

        cached_response = maybe_check_cache(
            openpipe_options=openpipe_options, req_payload=kwargs
        )
        if cached_response:
            return OpenAIObject.construct_from(cached_response, api_key=None)

        requested_at = int(time.time() * 1000)

        try:
            chat_completion = original_openai.ChatCompletion.create(*args, **kwargs)

            if inspect.isgenerator(chat_completion):

                def _gen():
                    assembled_completion = None
                    for chunk in chat_completion:
                        assembled_completion = merge_streamed_chunks(
                            assembled_completion, chunk
                        )
                        yield chunk

                    received_at = int(time.time() * 1000)

                    report(
                        openpipe_options=openpipe_options,
                        requested_at=requested_at,
                        received_at=received_at,
                        req_payload=kwargs,
                        resp_payload=assembled_completion,
                        status_code=200,
                    )

                return _gen()
            else:
                received_at = int(time.time() * 1000)

                report(
                    openpipe_options=openpipe_options,
                    requested_at=requested_at,
                    received_at=received_at,
                    req_payload=kwargs,
                    resp_payload=chat_completion,
                    status_code=200,
                )

            return chat_completion
        except Exception as e:
            received_at = int(time.time() * 1000)

            if isinstance(e, original_openai.OpenAIError):
                report(
                    openpipe_options=openpipe_options,
                    requested_at=requested_at,
                    received_at=received_at,
                    req_payload=kwargs,
                    resp_payload=e.json_body,
                    error_message=str(e),
                    status_code=e.http_status,
                )
            else:
                report(
                    openpipe_options=openpipe_options,
                    requested_at=requested_at,
                    received_at=received_at,
                    req_payload=kwargs,
                    error_message=str(e),
                )

            raise e

    @classmethod
    async def acreate(cls, *args, **kwargs):
        openpipe_options = kwargs.pop("openpipe", {})

        cached_response = await maybe_check_cache_async(
            openpipe_options=openpipe_options, req_payload=kwargs
        )
        if cached_response:
            return OpenAIObject.construct_from(cached_response, api_key=None)

        requested_at = int(time.time() * 1000)

        try:
            chat_completion = original_openai.ChatCompletion.acreate(*args, **kwargs)

            if inspect.isgenerator(chat_completion):

                def _gen():
                    assembled_completion = None
                    for chunk in chat_completion:
                        assembled_completion = merge_streamed_chunks(
                            assembled_completion, chunk
                        )
                        yield chunk

                    received_at = int(time.time() * 1000)

                    report_async(
                        openpipe_options=openpipe_options,
                        requested_at=requested_at,
                        received_at=received_at,
                        req_payload=kwargs,
                        resp_payload=assembled_completion,
                        status_code=200,
                    )

                return _gen()
            else:
                received_at = int(time.time() * 1000)

                report_async(
                    openpipe_options=openpipe_options,
                    requested_at=requested_at,
                    received_at=received_at,
                    req_payload=kwargs,
                    resp_payload=chat_completion,
                    status_code=200,
                )

            return chat_completion
        except Exception as e:
            received_at = int(time.time() * 1000)

            if isinstance(e, original_openai.OpenAIError):
                report_async(
                    openpipe_options=openpipe_options,
                    requested_at=requested_at,
                    received_at=received_at,
                    req_payload=kwargs,
                    resp_payload=e.json_body,
                    error_message=str(e),
                    status_code=e.http_status,
                )
            else:
                report_async(
                    openpipe_options=openpipe_options,
                    requested_at=requested_at,
                    received_at=received_at,
                    req_payload=kwargs,
                    error_message=str(e),
                )

            raise e


class OpenAIWrapper:
    ChatCompletion = WrappedChatCompletion()

    def __getattr__(self, name):
        return getattr(original_openai, name)

    def __setattr__(self, name, value):
        return setattr(original_openai, name, value)
