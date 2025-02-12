import express, { Express, Request, Response , Application } from 'express';
import dotenv from 'dotenv';
dotenv.config();
import cors from "cors";
import connectionToDatabase from "./dbconfig/index";
import router from "./routes";

try {
    const app: Application = express();
    app.use(cors({ origin: "*" }))
    connectionToDatabase();
    
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use("/", router);

    
    const port = process.env.PORT || 5000;

    app.get('/', (req: Request, res: Response) => {
        res.send('Welcome to handiwork backend');
    });

    app.listen(port, () => {
    console.log(`Server is Fire at http://localhost:${port}`);
    });
} catch (error) {
    console.log("err", error);
}

