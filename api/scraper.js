import axios from 'axios';
import * as cheerio from 'cheerio';

// In-memory cache for stock quotes
const quoteCache = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in ms

// Utility to clean scraped strings into numbers or clean text
function cleanValue(valStr) {
  if (!valStr) return null;
  const cleaned = valStr
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[₹%,]/g, '')
    .replace(/Cr\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  if (cleaned === '' || cleaned === '-') return null;
  return cleaned;
}

// Proxies the Screener search auto-complete endpoint
export async function searchStocks(query) {
  try {
    const response = await axios.get(`https://www.screener.in/api/company/search/?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      },
      timeout: 5000
    });
    return response.data; // Array of { id, name, url }
  } catch (error) {
    console.error(`Error searching stocks for query "${query}":`, error.message);
    throw new Error('Failed to fetch stock search results from Screener.in', { cause: error });
  }
}

// Scrapes the details of a stock
export async function scrapeStockDetails(urlPath) {
  let fullUrl;
  if (urlPath.startsWith('/company/')) {
    fullUrl = `https://www.screener.in${urlPath}`;
  } else {
    fullUrl = `https://www.screener.in/company/${urlPath.toUpperCase()}/`;
  }

  const now = Date.now();
  if (quoteCache[urlPath] && quoteCache[urlPath].expiry > now) {
    console.log(`Cache hit for stock details: ${urlPath}`);
    return quoteCache[urlPath].data;
  }

  try {
    console.log(`Cache miss. Scraping Screener.in: ${fullUrl}`);
    const response = await axios.get(fullUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);

    // Extract company name
    const name = $('h1').first().text().trim();
    if (!name) {
      throw new Error('Company name not found on Screener.in page. Invalid stock.');
    }

    let symbol = '';
    const match = urlPath.match(/\/company\/([^/]+)/);
    if (match) {
      symbol = match[1].toUpperCase();
    } else {
      symbol = urlPath.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    }

    const ratios = {};
    $('#top-ratios li').each((i, el) => {
      const label = $(el).find('span.name').text().trim();
      const valText = $(el).find('span.value').text().trim();
      
      const cleanVal = cleanValue(valText);
      if (label.includes('Current Price')) {
        ratios.currentPrice = parseFloat(cleanVal);
      } else if (label.includes('Market Cap')) {
        ratios.marketCap = parseFloat(cleanVal);
      } else if (label.includes('Stock P/E')) {
        ratios.peRatio = parseFloat(cleanVal);
      } else if (label.includes('Book Value')) {
        ratios.bookValue = parseFloat(cleanVal);
      } else if (label.includes('Dividend Yield')) {
        ratios.dividendYield = parseFloat(cleanVal);
      } else if (label.includes('ROCE')) {
        ratios.roce = parseFloat(cleanVal);
      } else if (label.includes('ROE')) {
        ratios.roe = parseFloat(cleanVal);
      } else if (label.includes('Face Value')) {
        ratios.faceValue = parseFloat(cleanVal);
      }
    });

    // Scrape daily price change percentage from top price block
    const changeEl = $('#top span.up, #top span.down').first();
    const changeText = changeEl.text().trim();
    const isDown = changeEl.hasClass('down');
    let changePercent = null;
    if (changeText) {
      const cleaned = changeText.replace(/[%\s]/g, '');
      const val = parseFloat(cleaned);
      if (!isNaN(val)) {
        changePercent = isDown ? -Math.abs(val) : val;
      }
    }

    const result = {
      symbol,
      name,
      urlPath,
      currentPrice: ratios.currentPrice || null,
      changePercent,
      marketCap: ratios.marketCap || null,
      peRatio: ratios.peRatio || null,
      bookValue: ratios.bookValue || null,
      dividendYield: ratios.dividendYield || null,
      roce: ratios.roce || null,
      roe: ratios.roe || null,
      faceValue: ratios.faceValue || null,
      scrapedAt: new Date().toISOString()
    };

    quoteCache[urlPath] = {
      data: result,
      expiry: now + CACHE_DURATION
    };

    return result;
  } catch (error) {
    console.error(`Error scraping stock details for ${urlPath}:`, error.message);
    throw new Error(`Failed to retrieve data for "${urlPath}" from Screener.in`, { cause: error });
  }
}
