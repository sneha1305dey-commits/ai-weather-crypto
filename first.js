import express from 'express';
import cors from 'cors';
import { GoogleGenAI, Type } from '@google/genai';
import 'dotenv/config';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

app.get('/', (req, res) => {
  res.sendFile('index.html', { root: '.' });
});

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// In-memory conversation history per session
const sessions = new Map();

// --- Tool Implementations ---
async function cryptoCurrency({ coin }) {
  try {
    const formattedCoin = coin.toLowerCase().trim();
    // FIX: baseUrl define kiya gaya hai
    const baseUrl = process.env.COINGECKO_API_URL;

    const response = await fetch(
      `${baseUrl}?vs_currency=inr&ids=${encodeURIComponent(formattedCoin)}`
    );
    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      return { error: `Could not find cryptocurrency with ID "${coin}".` };
    }

    return {
      name: data[0].name,
      symbol: data[0].symbol?.toUpperCase(),
      current_price_inr: data[0].current_price,
      high_24h_inr: data[0].high_24h,
      low_24h_inr: data[0].low_24h,
      price_change_percentage_24h: data[0].price_change_percentage_24h
    };
  } catch (error) {
    return { error: `Failed to fetch crypto data: ${error.message}` };
  }
}

async function weatherInformation({ city }) {
  try {
    const apiKey = process.env.WEATHER_API_KEY;
    // FIX: baseUrl define kiya gaya hai
    const baseUrl = process.env.WEATHER_API_URL;

    const response = await fetch(
      `${baseUrl}?key=${apiKey}&q=${encodeURIComponent(city)}&aqi=no`
    );
    const data = await response.json();

    if (data.error) {
      return { error: data.error.message };
    }

    return {
      city: data.location.name,
      region: data.location.region,
      country: data.location.country,
      temperature_c: data.current.temp_c,
      condition: data.current.condition.text,
      humidity: data.current.humidity,
      wind_kph: data.current.wind_kph
    };
  } catch (error) {
    return { error: `Failed to fetch weather data: ${error.message}` };
  }
}

// --- Gemini Tool Declarations ---
const cryptoInfo = {
  name: 'cryptoCurrency',
  description: 'Get current price and 24h market stats for cryptocurrencies like bitcoin, ethereum, solana, etc.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      coin: {
        type: Type.STRING,
        description: 'Coin ID in lowercase (e.g., bitcoin, ethereum, dogecoin, solana)'
      }
    },
    required: ['coin']
  }
};

const weatherInfo = {
  name: 'weatherInformation',
  description: 'Get real-time weather information for any city or region.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      city: {
        type: Type.STRING,
        description: 'City name (e.g., Mumbai, London, New York)'
      }
    },
    required: ['city']
  }
};

const tools = [{ functionDeclarations: [cryptoInfo, weatherInfo] }];
const toolFunctions = {
  cryptoCurrency,
  weatherInformation
};

// --- Agent Execution Loop ---
async function runAgent(history, userMessage) {
  history.push({
    role: 'user',
    parts: [{ text: userMessage }]
  });

  const MAX_STEPS = 5;
  let steps = 0;

  while (steps < MAX_STEPS) {
    steps++;

    const result = await ai.models.generateContent({
      model: 'gemini-3.5-flash-lite',
      contents: history,
      config: {
        tools,
        systemInstruction: 'You are a helpful assistant specialized in real-time weather and crypto market prices. Provide clean, well-formatted answers.'
      }
    });

    const candidate = result.candidates?.[0];
    if (!candidate) {
      return 'Sorry, I could not generate a response. Please try again.';
    }

    // Check if Gemini requested function execution
    if (result.functionCalls && result.functionCalls.length > 0) {
      history.push(candidate.content);

      for (const call of result.functionCalls) {
        const { name, args } = call;
        const toolFn = toolFunctions[name];
        const output = toolFn
          ? await toolFn(args)
          : { error: `Function ${name} not found` };

        history.push({
          role: 'user',
          parts: [
            {
              functionResponse: {
                name,
                response: { result: output }
              }
            }
          ]
        });
      }
    } else {
      const responseText = result.text || 'I have completed your request.';
      history.push({
        role: 'model',
        parts: [{ text: responseText }]
      });
      return responseText;
    }
  }

  return 'I completed the actions, but reached the maximum tool reasoning steps.';
}

// --- Chat API Endpoint ---
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId = 'default' } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, []);
    }
    const history = sessions.get(sessionId);

    const reply = await runAgent(history, message);
    res.json({ reply });
  } catch (error) {
    console.error('Error running agent:', error);
    res.status(500).json({ error: 'Failed to process your request.' });
  }
});

// Clear Session / Reset Chat
app.post('/api/reset', (req, res) => {
  const { sessionId = 'default' } = req.body;
  sessions.delete(sessionId);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});