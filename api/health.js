import { getSharedApp } from './realtime.js';

export default function handler(req, res) {
  req.url = '/api/health';
  return getSharedApp().app(req, res);
}

