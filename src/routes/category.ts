import { Request, Response, Router } from "express";
import Category from "../schema/categorySchema";


const salt = 10;

const categoryRouter = Router();

categoryRouter
.get("/", async (req: Request, res: Response) => {
    try {
        const allcategory = await Category.find();

        res.status(200).json({
            categories: allcategory,
            message: "success"
       })
    } catch (error) {
        res.status(500).json({
            success: false,
            message: `unable to get categories, ${error}`
        })
    }
})
.get("/:id", async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const category = await Category.findById({ _id: id });
        if(!category) res.status(404).json({
            message: "No category with this id exist"
        })
        else {
            res.status(200).json({
                category,
                message: "success"
            })
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: `unable to create user, ${error}`
        })
    }
})
.post("/", async(req: Request, res: Response) => {
    const { title, description, skills} = req.body;

    const category = await Category.findOne({
        title
    });
    if(category) res.status(400).json({
        message: "Category with this title already exist"
    })
    else {
        const cat = await Category.create({
            ...req.body
        })

        await cat.save();

        res.status(200).json({
            category: cat,
            message: "success"
        })
    }
})
.put("/:id", async(req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const category = await Category.findById({ _id: id });
        if(!category) res.status(404).json({
            message: "No category with this id exist"
        })
        else {
            await category.updateOne({
                ...req.body
            });
            await category.save();
            res.status(200).json({
                message: "success",
                category
            })
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: `unable to edit this category, ${error}`
        })
    }
})
.delete("/:id", async(req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const category = await Category.findById({ _id: id });
        if(!category) res.status(404).json({
            message: "No category with this id exist"
        })
        else {
            await category.deleteOne();
            res.status(200).json({
                message: "success"
            })
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: `unable to delete this category, ${error}`
        })
    }
})


export default categoryRouter;