import { Request, Response, Router } from "express";
import Skill from "../schema/skillsSchema";
import Category from "../schema/categorySchema";
import { Types } from "mongoose";


const skillRouter = Router();

skillRouter
.get("/", async (req: Request, res: Response) => {
    try {
        const allSkill = await Skill.find();

        res.status(200).json({
            skills: allSkill,
            count: allSkill.length,
            message: "success"
       })
    } catch (error) {
        res.status(500).json({
            success: false,
            message: `unable to get all skills, ${error}`
        })
    }
})
.get("/:id", async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const skill = await Skill.findById({ _id: id });
        if(!skill) res.status(404).json({
            message: "No skill with this id exist"
        })
        else {
            res.status(200).json({
                skill,
                message: "success"
            })
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: `unable to get skiill, ${error}`
        })
    }
})
.get("/:id/skills", async (req: Request, res: Response) => {
    try {
        const categoryId = req.params.id;

        // Validate category exists
        const category = await Category.findById(categoryId).populate({
            path: "skills",
            select: "title description",
            options: { sort: { title: 1 } } // optional: sort skills alphabetically
        });

        if (!category) {
            return res.status(404).json({
                success: false,
                message: "Category not found",
                skills: []
            });
        }

        return res.status(200).json({
            success: true,
            category: {
                _id: category._id,
                title: category.title,
                description: category.description,
                skills: category.skills
            },
            message: "Skills fetched successfully"
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: `Unable to fetch skills: ${error}`,
            skills: []
        });
    }
})
.post("/", async (req: Request, res: Response) => {
    try {
        const payload = req.body;

        // If body is an array → multiple create
        if (Array.isArray(payload)) {

            // Extract titles
            const titles = payload.map((skill) => skill.title);

            // Check for duplicates already in DB
            const existing = await Skill.find({ title: { $in: titles } });

            if (existing.length > 0) {
                return res.status(400).json({
                    message: "Some skills already exist",
                    existing: existing.map(s => s.title)
                });
            }

            // Insert many
            const newSkills = await Skill.insertMany(payload);

            return res.status(200).json({
                message: "Skills added successfully",
                skills: newSkills
            });
        }

        // Otherwise → single skill insert
        const { title } = payload;

        const skill = await Skill.findOne({ title });
        if (skill) {
            return res.status(400).json({
                message: "Skill with this title already exists"
            });
        }

        const newSkill = await Skill.create(payload);

        return res.status(200).json({
            message: "success",
            skill: newSkill
        });

    } catch (error) {
        res.status(500).json({
            message: "Server error",
            error
        });
    }
})
.put("/:id", async(req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const skill = await Skill.findById({ _id: id });
        if(!skill) res.status(404).json({
            message: "No skill with this id exist"
        })
        else {
            await skill.updateOne({
                ...req.body
            });
            await skill.save();
            res.status(200).json({
                message: "success",
                skill
            })
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: `unable to edit this skill, ${error}`
        })
    }
})
.delete("/:id", async(req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const skill = await Skill.findById({ _id: id });
        if(!skill) res.status(404).json({
            message: "No skill with this id exist"
        })
        else {
            await skill.deleteOne();
            res.status(200).json({
                message: "success"
            })
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: `unable to delete this skill, ${error}`
        })
    }
})
.post("/multiple", async (req: Request, res: Response) => {
    try {
        const { skills } = req.body;

        if (!Array.isArray(skills) || skills.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No skills provided"
            });
        }

        const createdSkills = [];
        const skippedSkills: string[] = [];

        // Group skills by category
        const categorySkillMap: Record<string, Types.ObjectId[]> = {};

        for (const skill of skills) {
            if (!skill.categoryId) {
                skippedSkills.push(`${skill.title} (missing categoryId)`);
                continue;
            }

            const category = await Category.findById(skill.categoryId);
            if (!category) {
                skippedSkills.push(`${skill.title} (invalid categoryId)`);
                continue;
            }

            const exists = await Skill.findOne({ title: skill.title });
            if (exists) {
                skippedSkills.push(skill.title);
                continue;
            }

            const newSkill = await Skill.create({
                title: skill.title,
                description: skill.description || "",
                category: category._id
            });
            await newSkill.save();

            createdSkills.push(newSkill);

            // Collect skills per category
            if (!categorySkillMap[category._id.toString()]) {
                categorySkillMap[category._id.toString()] = [];
            }
            categorySkillMap[category._id.toString()].push(newSkill._id);
        }

        // Update each category once with all new skills
        for (const [categoryId, skillIds] of Object.entries(categorySkillMap)) {
            await Category.findByIdAndUpdate(categoryId, { $push: { skills: { $each: skillIds } } });
        }

        return res.status(200).json({
            success: true,
            createdCount: createdSkills.length,
            skippedCount: skippedSkills.length,
            skippedSkills,
            message: "Skills upload completed"
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: `Unable to upload skills: ${error}`
        });
    }
})
.delete("/", async (req: Request, res: Response) => {
    try {
        const { ids } = req.body; 
        
        if (Array.isArray(ids) && ids.length > 0) {
            const result = await Skill.deleteMany({ _id: { $in: ids } });

            return res.status(200).json({
                message: "Selected skills deleted successfully",
                deletedCount: result.deletedCount,
            });
        }

        const result = await Skill.deleteMany({});

        return res.status(200).json({
            message: "All skills deleted successfully",
            deletedCount: result.deletedCount,
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: `Unable to delete skills: ${error}`,
        });
    }
});



export default skillRouter;