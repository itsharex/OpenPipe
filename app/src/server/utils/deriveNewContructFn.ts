import { type PromptVariant } from "@prisma/client";
import ivm from "isolated-vm";
import dedent from "dedent";
import { openai } from "./openai";
import { isObject } from "lodash-es";
import type { CreateChatCompletionRequestMessage } from "openai/resources/chat/completions";
import formatPromptConstructor from "~/promptConstructor/format";
import { type SupportedProvider, type Model } from "~/modelProviders/types";
import modelProviders from "~/modelProviders/modelProviders";

const isolate = new ivm.Isolate({ memoryLimit: 128 });

export async function deriveNewConstructFn(
  originalVariant: PromptVariant | null,
  originalPromptFn?: string,
  newModel?: Model,
  instructions?: string,
) {
  if (originalPromptFn && !newModel && !instructions) {
    return originalPromptFn;
  }
  if (originalVariant && originalPromptFn && (newModel || instructions)) {
    return await requestUpdatedPromptFunction(
      originalVariant,
      originalPromptFn,
      newModel,
      instructions,
    );
  }
  return dedent`
  definePrompt("openai/ChatCompletion", {
    model: "gpt-3.5-turbo-0613",
    messages: [
      {
        role: "system",
        content: \`Hello, world!\`,
      },
    ],
  });`;
}

const NUM_RETRIES = 5;
const requestUpdatedPromptFunction = async (
  originalVariant: PromptVariant,
  originalPromptFn: string,
  newModel?: Model,
  instructions?: string,
) => {
  const originalModelProvider = modelProviders[originalVariant.modelProvider as SupportedProvider];
  const originalModel = originalModelProvider.models[originalVariant.model] as Model;
  let newConstructionFn = "";
  for (let i = 0; i < NUM_RETRIES; i++) {
    try {
      const messages: CreateChatCompletionRequestMessage[] = [
        {
          role: "system",
          content: `Your job is to update prompt constructor functions. Here is the api shape for the current model:\n---\n${JSON.stringify(
            originalModelProvider.inputSchema,
            null,
            2,
          )}`,
        },
        {
          role: "user",
          content: `This is the current prompt constructor function:\n---\n${originalPromptFn}`,
        },
      ];
      if (newModel) {
        messages.push({
          role: "user",
          content: `Return the prompt constructor function for ${newModel.name} given the existing prompt constructor function for ${originalModel.name}`,
        });
        if (newModel.provider !== originalModel.provider) {
          messages.push({
            role: "user",
            content: `As seen in the first argument to definePrompt, the old provider endpoint was "${
              originalModel.provider
            }". The new provider endpoint is "${
              newModel.provider
            }". Here is the schema for the new model:\n---\n${JSON.stringify(
              modelProviders[newModel.provider].inputSchema,
              null,
              2,
            )}`,
          });
        } else {
          messages.push({
            role: "user",
            content: `The provider is the same as the old provider: ${originalModel.provider}`,
          });
        }
      }
      if (instructions) {
        messages.push({
          role: "user",
          content: instructions,
        });
      }
      const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages,
        functions: [
          {
            name: "update_prompt_constructor_function",
            parameters: {
              type: "object",
              properties: {
                new_prompt_function: {
                  type: "string",
                  description: "The new prompt function, runnable in typescript",
                },
              },
            },
          },
        ],
        function_call: {
          name: "update_prompt_constructor_function",
        },
        openpipe: {
          tags: {
            prompt_id: "deriveNewConstructFn",
            model_translation: (!!newModel).toString(),
          },
        },
      });
      const argString = completion.choices[0]?.message?.function_call?.arguments || "{}";

      const code = `
        global.contructPromptFunctionArgs = ${argString};
        `;

      const context = await isolate.createContext();

      const jail = context.global;
      await jail.set("global", jail.derefInto());

      const script = await isolate.compileScript(code);

      await script.run(context);
      const contructPromptFunctionArgs = (await context.global.get(
        "contructPromptFunctionArgs",
      )) as ivm.Reference;

      const args = await contructPromptFunctionArgs.copy(); // Get the actual value from the isolate

      if (args && isObject(args) && "new_prompt_function" in args) {
        newConstructionFn = await formatPromptConstructor(args.new_prompt_function as string);
        break;
      }
    } catch (e) {
      console.error(e);
    }
  }

  return newConstructionFn;
};
