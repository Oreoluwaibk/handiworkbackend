import express, { Application, Request, Response } from 'express';
import dotenv from 'dotenv';
dotenv.config();

import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';

import connectionToDatabase from './dbconfig/index';
import router from './routes';
import handleSocket from './utils/socketHandler.';
// import handleSocket from './sockets/socketHandler'; // 👈 import your handler

const app: Application = express();
const httpServer = createServer(app); // 👈 wrap express with http server

const io = new Server(httpServer, {
  cors: {
    origin: '*', // Change this in production to match your frontend origin
    methods: ['GET', 'POST']
  }
});

// ⏬ Call your custom socket logic here
handleSocket(io); // 👈 important

connectionToDatabase();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Make uploads/messages publicly accessible
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API routes
app.use('/api/', router);

// Basic test route
app.get('/', (req: Request, res: Response) => {
  res.send('Welcome to Handiwork backend');
});

const port = process.env.PORT || 5000;

httpServer.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
