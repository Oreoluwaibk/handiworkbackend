import { Request, Response, Router } from "express";
import Support from "../schema/supportSchema";



const supportRouter = Router();

supportRouter
.get("/", async (req: Request, res: Response) => {
    try {
        const allSupport = await Support.find();

        res.status(200).json({
            support: allSupport,
            message: "success"
       })
    } catch (error) {
        res.status(500).json({
            success: false,
            message: `unable to get supports, ${error}`
        })
    }
})
.get("/:id", async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const support = await Support.findById({ _id: id });
        if(!support) res.status(404).json({
            message: "No support message with this id exist"
        })
        else {
            res.status(200).json({
                support,
                message: "success"
            })
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: `unable to get support, ${error}`
        })
    }
})
.get("/:user_id", async (req: Request, res: Response) => {
    const { user_id } = req.params;
    try {
        const support = await Support.findById({ user_id });
        if(!support) res.status(404).json({
            message: "No support message for this user"
        })
        else {
            res.status(200).json({
                support,
                message: "success"
            })
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: `unable to get support, ${error}`
        })
    }
})
.post("/", async(req: Request, res: Response) => {
    try {
        const support = await Support.create({
            ...req.body
        })
    
        await support.save();
    
        res.status(200).json({
            message: "success, your response has been saved"
        })
        
    } catch (error: any) {
        console.log("err", error.response);
        
        res.status(500).send(`Unable to save your response - ${error}`)
    }
})
.delete("/:id", async(req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const support = await Support.findById({ _id: id });
        if(!support) res.status(404).json({
            message: "No support with this id exist"
        })
        else {
            await support.deleteOne();
            res.status(200).json({
                message: "success"
            })
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: `unable to delete this support, ${error}`
        })
    }
})


export default supportRouter;