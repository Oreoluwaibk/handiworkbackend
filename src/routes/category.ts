import { Request, Response, Router } from "express";
import Category from "../schema/categorySchema";
import { authentication } from "../middleware/authentication";
import { requireAdminKey } from "../middleware/adminAuth";

const categoryRouter = Router();

categoryRouter
.get("/", async (req: Request, res: Response) => {
    try {
        const allCategories = await Category.find()
            .populate({
                path: "skills",
                select: "title description", // Only include these fields
            })
            .exec();

        res.status(200).json({
            success: true,
            categories: allCategories,
            message: "Categories fetched successfully"
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            categories: [],
            message: `Unable to get categories: ${error}`
        });
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
.post("/", authentication, requireAdminKey, async(req: Request, res: Response) => {
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
.post("/multiple", authentication, requireAdminKey, async (req: Request, res: Response) => {
    const data = Array.isArray(req.body) ? req.body : [req.body];

    const createdCategories: any[] = [];
    const duplicates: any[] = [];

    for (const item of data) {
        const { title } = item;

        const existing = await Category.findOne({ title });

        if (existing) {
            duplicates.push({
                title,
                message: "Category already exists"
            });
            continue;
        }

        const newCat = await Category.create(item);
        await newCat.save();
        createdCategories.push(newCat);
    }

    res.status(200).json({
        created: createdCategories,
        duplicates,
        message: "Process complete"
    });
})
.put("/:id", authentication, requireAdminKey, async(req: Request, res: Response) => {
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
.delete("/:id", authentication, requireAdminKey, async(req: Request, res: Response) => {
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
.delete("/", authentication, requireAdminKey, async (req: Request, res: Response) => {
    try {
        const { id, ids } = req.body;

        const list = ids || (id ? [id] : []);

        if (!list.length) {
            return res.status(400).json({
                success: false,
                message: "Provide id or ids to delete",
            });
        }

        const deleted: any[] = [];
        const notFound: any[] = [];

        for (const categoryId of list) {
            const category = await Category.findById(categoryId);

            if (!category) {
                notFound.push({
                    id: categoryId,
                    message: "Category not found"
                });
                continue;
            }

            await category.deleteOne();
            deleted.push(categoryId);
        }

        return res.status(200).json({
            success: true,
            deleted,
            notFound,
            message: "Delete operation completed"
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: `Unable to delete category(ies): ${error}`
        });
    }
});




export default categoryRouter;