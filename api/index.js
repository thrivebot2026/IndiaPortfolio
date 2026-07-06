/* global process */
import express from 'express';
import cors from 'cors';
import * as scraper from './scraper.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Log requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Stateless Search Proxy Route
app.get('/api/stocks/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.json([]);
    }
    const results = await scraper.searchStocks(q);
    res.json(results);
  } catch (error) {
    console.error('Search proxy error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Stateless Scrape Quote Proxy Route
app.get('/api/stocks/price', async (req, res) => {
  try {
    const { urlPath } = req.query;
    if (!urlPath) {
      return res.status(400).json({ error: 'urlPath query parameter is required' });
    }
    const data = await scraper.scrapeStockDetails(urlPath);
    res.json(data);
  } catch (error) {
    console.error('Scrape proxy error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Fallback for Vercel functions and dev tests
app.get('/api', (req, res) => {
  res.json({ status: 'ok', service: 'indiaportfolio-stateless-backend' });
});

// Error handling middleware
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Only listen when running locally, Vercel will handle the routing serverlessly
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Stateless server running locally on port ${PORT}`);
  });
}

export default app;
