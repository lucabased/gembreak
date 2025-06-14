import { GoogleGenerativeAI, Content, SafetySetting, HarmCategory, HarmBlockThreshold, Tool, FunctionDeclarationSchema, Part } from "@google/generative-ai";
import { getChatSessionsCollection } from '@/lib/mongodb';
import { ChatSession, ChatMessage } from '@/lib/types/ChatSession';
import { ObjectId } from 'mongodb';

// Get your API key from https://makersuite.google.com/app/apikey
// Access your API key as an environment variable
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);

export async function POST(req: Request) {
  const { prompt: userPrompt, sessionId: sessionIdString, systemPrompt, userId: userIdString } = await req.json();

  if (!userIdString) {
    return new Response(JSON.stringify({ error: "userId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!sessionIdString) {
    return new Response(JSON.stringify({ error: "sessionId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!userPrompt) {
    return new Response(JSON.stringify({ error: "prompt is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let userIdObjectId: ObjectId;

  try {
    userIdObjectId = new ObjectId(userIdString); 
  } catch (error) {
    return new Response(JSON.stringify({ error: "Invalid userId format" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const safetySettings: SafetySetting[]  = [
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  ];

  const googleSearchTool: Tool = {
    functionDeclarations: [
      {
        name: "google_search",
        description: "Performs a Google search to find information on the web based on a query.",
        parameters: {
          type: "OBJECT" as any, // Using string literal with 'as any' to bypass strict type checking for this part
          properties: {
            query: { type: "STRING" as any, description: "The search query to find information about" }, // Using string literal with 'as any'
          },
          required: ["query"],
        },
      }
    ]
  };

  const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash-latest",
    systemInstruction: systemPrompt,
    safetySettings: safetySettings,
    tools: [googleSearchTool]
  });

  async function performGoogleSearch(query: string): Promise<object> {
    console.log(`MOCK Google Search for: ${query}`);
    await new Promise(resolve => setTimeout(resolve, 500));
    return {
      results: [
        { title: `Mock Result 1 for "${query}"`, snippet: `This is a simulated snippet for the query: ${query}.`, url: `https://example.com/search?q=${encodeURIComponent(query)}&result=1` },
        { title: `Mock Result 2: More about "${query}"`, snippet: `Another piece of information regarding ${query}.`, url: `https://example.com/search?q=${encodeURIComponent(query)}&result=2` },
      ],
      searchInformation: { totalResults: "2", searchTime: 0.5 }
    };
  }

  try {
    const chatSessionsCollection = await getChatSessionsCollection();
    const userMessage: ChatMessage = { role: 'user', content: userPrompt, timestamp: new Date() };

    let chatSession = await chatSessionsCollection.findOneAndUpdate(
      { _id: sessionIdString, chatOwnerID: userIdObjectId },
      { 
        $push: { chatHistory: userMessage },
        $set: { updatedAt: new Date() },
        $setOnInsert: { _id: sessionIdString, chatOwnerID: userIdObjectId, createdAt: new Date() }
      },
      { upsert: true, returnDocument: 'after' }
    );

    if (!chatSession) {
      chatSession = await chatSessionsCollection.findOne({ _id: sessionIdString, chatOwnerID: userIdObjectId });
      if (!chatSession) {
        return new Response(JSON.stringify({ error: "Failed to create or update chat session." }), {
            status: 500, headers: { "Content-Type": "application/json" },
        });
      }
    }
    
    const historyForAI: Content[] = chatSession.chatHistory
      .slice(0, -1) 
      .map(msg => ({
        role: msg.role === 'assistant' ? 'model' : msg.role,
        parts: [{ text: msg.content }],
      }));

    const chat = model.startChat({ history: historyForAI });

    let result = await chat.sendMessage(userPrompt);
    let apiResponse = result.response;
    let modelResponseText = "";

    let currentFunctionCalls = apiResponse.functionCalls();
    while (currentFunctionCalls && currentFunctionCalls.length > 0) {
      const fc = currentFunctionCalls[0];
      console.log("Model wants to call tool:", fc.name, "with args:", fc.args);

      if (fc.name === 'google_search') {
        const searchQuery = (fc.args as { query?: string }).query;
        if (!searchQuery) {
          console.error("Google search tool called without a query or query is undefined.");
          result = await chat.sendMessage([{ functionResponse: { name: 'google_search', response: { error: "Search query was missing." } } }]);
        } else {
          try {
            const toolResult = await performGoogleSearch(searchQuery);
            console.log("Tool 'google_search' executed, result:", toolResult);
            result = await chat.sendMessage([{ functionResponse: { name: 'google_search', response: toolResult } }]);
          } catch (toolError) {
            console.error("Error executing google_search tool:", toolError);
            const errorMessage = toolError instanceof Error ? toolError.message : "Unknown error during tool execution";
            result = await chat.sendMessage([{ functionResponse: { name: 'google_search', response: { error: `Failed to execute search: ${errorMessage}` } } }]);
          }
        }
        apiResponse = result.response;
        currentFunctionCalls = apiResponse.functionCalls(); // Re-evaluate for next iteration
      } else {
        console.warn(`Model called unknown tool: ${fc.name}`);
        break; 
      }
    }
    
    const promptFeedback = apiResponse.promptFeedback;
    if (promptFeedback?.blockReason) {
      console.warn("AI response blocked:", promptFeedback);
      const blockMessage = promptFeedback.blockReason ? `Response blocked due to: ${promptFeedback.blockReason}` : "Response blocked by content filter.";
      const blockedAiMessage: ChatMessage = { role: 'assistant', content: `[AI response blocked: ${promptFeedback.blockReason || 'Content filter'}]`, timestamp: new Date() };
      await chatSessionsCollection.updateOne(
        { _id: sessionIdString },
        { $push: { chatHistory: blockedAiMessage }, $set: { updatedAt: new Date() } }
      );
      return new Response(JSON.stringify({ error: blockMessage, isBlocked: true }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }

    modelResponseText = apiResponse.text() || ""; 

    const finalFunctionCalls = apiResponse.functionCalls();
    if (!modelResponseText && (!finalFunctionCalls || finalFunctionCalls.length === 0)) {
      console.warn("Model did not return text and no further tool calls are pending. API Response:", apiResponse);
      modelResponseText = "[The model did not provide a textual response after processing.]";
    }

    const modelMessage: ChatMessage = { role: 'assistant', content: modelResponseText, timestamp: new Date() };
    const updateOperation: any = { $push: { chatHistory: modelMessage }, $set: { updatedAt: new Date() } };

    if (chatSession && !chatSession.title && modelResponseText.trim() && modelResponseText !== "[The model did not provide a textual response after processing.]") {
      const newTitle = modelResponseText.substring(0, 50) + (modelResponseText.length > 50 ? "..." : "");
      updateOperation.$set.title = newTitle;
    }

    await chatSessionsCollection.updateOne({ _id: sessionIdString }, updateOperation);

    return new Response(JSON.stringify({ text: modelResponseText }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in POST /api/generate:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to generate content";
    try {
      const chatSessionsCollection = await getChatSessionsCollection();
      const errorAiMessage: ChatMessage = { role: 'assistant', content: `[Error processing request: ${errorMessage}]`, timestamp: new Date() };
      await chatSessionsCollection.updateOne(
          { _id: sessionIdString }, // Ensure sessionIdString is in scope or passed correctly
          { $push: { chatHistory: errorAiMessage }, $set: { updatedAt: new Date() } }
      );
    } catch (dbError) {
      console.error("Failed to save error message to DB:", dbError);
    }
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
}
