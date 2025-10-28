import { z } from 'zod';
import { tool } from 'ai';
import { create, all } from 'mathjs';

const math = create(all, {
  number: 'number',
  precision: 14,
});

const withTimeout = (promise: Promise<Response>, ms = 8000) =>
  Promise.race([
    promise,
    new Promise<Response>((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), ms),
    ),
  ]);

/**
 * Calculator Tool
 */
export const calculatorTool = tool({
  description:
    'Perform mathematical calculations from basic arithmetic to advanced Class-12 level and higher, including trigonometry, logarithms, algebra, and calculus expressions.',
  parameters: z.object({
    expression: z
      .string()
      .describe(
        'Mathematical expression (e.g., "2 + 2", "sqrt(16)", "sin(45 deg)", "log(100,10)", "integrate(x^2, x)")',
      ),
  }),
  execute: async ({ expression }) => {
    console.log(`[Calculator] Expression: "${expression}"`);
    try {
      const result = math.evaluate(expression);

      return {
        expression,
        result,
        success: true,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      console.error('Calculation error:', error.message);
      return {
        expression,
        error: error.message || 'Invalid or unsupported mathematical expression',
        success: false,
        timestamp: new Date().toISOString(),
      };
    }
  },
}); Google Custom Web Search Tool
 */
export const webSearchTool = tool({
  description:
    'Search the web using Google Custom Search API for real-time and recent information.',
  parameters: z.object({
    query: z.string().describe('The search query'),
    numResults: z
      .number()
      .optional()
      .default(5)
      .describe('Number of results to return'),
  }),
  execute: async ({ query, numResults }) => {
    const apiKey = process.env.GOOGLE_API_KEY;
    const cx = process.env.GOOGLE_CSE_ID;

    if (!apiKey || !cx) {
      console.error(
        'Missing GOOGLE_API_KEY or GOOGLE_CSE_ID in environment variables.',
      );
      return {
        query,
        results: [],
        error: 'Search unavailable: missing API configuration.',
        timestamp: new Date().toISOString(),
      };
    }

    const apiUrl = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(
      query,
    )}&key=${apiKey}&cx=${cx}&num=${numResults}`;

    try {
      const response = await withTimeout(fetch(apiUrl));
      if (!response.ok) {
        throw new Error(`Google API Error: ${response.status}`);
      }

      const data = await response.json();
      const items = data.items || [];

      const results = items.map((item: any) => ({
        title: item.title,
        url: item.link,
        snippet: item.snippet || '',
      }));

      return {
        source: 'Google Search',
        query,
        results,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      console.error('Web search failed:', error.message);
      return {
        query,
        results: [],
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  },
});

/**
 * Weather Tool
 */
export const weatherTool = tool({
  description:
    'Get current weather information for a specific city or location using Open-Meteo API.',
  parameters: z.object({
    location: z
      .string()
      .describe('City name or location (e.g., London, New York, Delhi)'),
    units: z.enum(['celsius', 'fahrenheit']).optional().default('celsius'),
  }),
  execute: async ({ location, units }) => {
    console.log(`[Weather] Location: "${location}", Units: ${units}`);

    try {
      // Step 1: Geocode
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        location,
      )}&count=1`;
      const geoRes = await withTimeout(fetch(geoUrl));
      const geoData = await geoRes.json();

      if (!geoData.results || geoData.results.length === 0) {
        return {
          location,
          error: 'Location not found',
          timestamp: new Date().toISOString(),
        };
      }

      const { latitude, longitude, name, country } = geoData.results[0];

      // Step 2: Fetch weather
      const tempUnit = units === 'fahrenheit' ? 'fahrenheit' : 'celsius';
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&temperature_unit=${tempUnit}&windspeed_unit=kmh`;
      const weatherRes = await withTimeout(fetch(weatherUrl));
      const weatherData = await weatherRes.json();

      if (!weatherData.current_weather) {
        throw new Error('Weather data unavailable');
      }

      const { temperature, windspeed, weathercode } =
        weatherData.current_weather;

      const conditions: Record<number, string> = {
        0: 'Clear sky',
        1: 'Mainly clear',
        2: 'Partly cloudy',
        3: 'Overcast',
        45: 'Fog',
        48: 'Depositing rime fog',
        51: 'Light drizzle',
        61: 'Rain',
        71: 'Snowfall',
        80: 'Rain showers',
        95: 'Thunderstorm',
      };

      const condition = conditions[weathercode] || 'Unknown';

      return {
        location: `${name}, ${country}`,
        temperature,
        unit: tempUnit,
        condition,
        windSpeed: windspeed,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      console.error('Weather API error:', error.message);
      return {
        location,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  },
});

/**
 * Image Search Tool
 */
export const imageSearchTool = tool({
  description:
    'Search for images using Google Custom Search (Image Type) or fallback to Unsplash API.',
  parameters: z.object({
    query: z.string().describe('The image search query'),
    count: z
      .number()
      .optional()
      .default(4)
      .describe('Number of images to return'),
  }),
  execute: async ({ query, count }) => {
    const googleKey = process.env.GOOGLE_API_KEY;
    const googleCx = process.env.GOOGLE_CSE_ID;
    const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;

    console.log(`[Image Search] Query: "${query}", Count: ${count}`);

    const formatResults = (items: any[], source: string) =>
      items.map((item: any, i: number) => ({
        url: item.link || item.urls?.regular || item.url,
        thumbnail:
          item.image?.thumbnailLink || item.urls?.thumb || item.thumbnail,
        title: item.title || `${query} - Image ${i + 1}`,
        source,
      }));

    try {
      // --- GOOGLE IMAGE SEARCH (Primary) ---
      if (googleKey && googleCx) {
        const googleUrl = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(
          query,
        )}&searchType=image&num=${count}&key=${googleKey}&cx=${googleCx}`;
        const res = await withTimeout(fetch(googleUrl));
        if (res.ok) {
          const data = await res.json();
          if (data.items?.length) {
            return {
              query,
              images: formatResults(data.items, 'Google Images'),
              timestamp: new Date().toISOString(),
            };
          }
        }
      }

      // --- UNSPLASH FALLBACK ---
      if (unsplashKey) {
        const unsplashUrl = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
          query,
        )}&per_page=${count}&client_id=${unsplashKey}`;
        const res = await withTimeout(fetch(unsplashUrl));
        if (res.ok) {
          const data = await res.json();
          if (data.results?.length) {
            return {
              query,
              images: formatResults(data.results, 'Unsplash'),
              timestamp: new Date().toISOString(),
            };
          }
        }
      }

      // --- SIMULATED FALLBACK ---
      const fallback = Array.from({ length: count }, (_, i) => ({
        url: `https://picsum.photos/seed/${query}-${i}/600/400`,
        thumbnail: `https://picsum.photos/seed/${query}-${i}/300/200`,
        title: `${query} - Image ${i + 1}`,
        source: 'Placeholder (Picsum)',
      }));

      return { query, images: fallback, timestamp: new Date().toISOString() };
    } catch (error: any) {
      console.error('Image search failed:', error.message);
      return {
        query,
        images: [],
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  },
});

/**
 *