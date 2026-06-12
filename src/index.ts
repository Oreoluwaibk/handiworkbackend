import express, { Application, Request, Response } from 'express';
import dotenv from 'dotenv';
dotenv.config();

import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';

import connectionToDatabase from './dbconfig/index';
import router from './routes';
import handleSocket from './utils/socketHandler';
import { setSocketIo } from './utils/socketIo';

const app: Application = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
});

setSocketIo(io);
handleSocket(io);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/', router);

app.get('/', (req: Request, res: Response) => {
  res.send('Welcome to Handiwork backend');
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({ message: 'Route not found' });
});

const port = process.env.PORT || 5000;

const startServer = async () => {
  await connectionToDatabase();

  httpServer.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
  });
};

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
