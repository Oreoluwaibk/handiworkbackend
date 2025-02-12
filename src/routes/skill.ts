import { Request, Response, Router } from "express";
import Skill from "../schema/skillsSchema";


const skillRouter = Router();

skillRouter
.get("/", async (req: Request, res: Response) => {
    try {
        const allSkill = await Skill.find();

        res.status(200).json({
            skills: allSkill,
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
.post("/", async(req: Request, res: Response) => {
    const { title } = req.body;

    const skill = await Skill.findOne({
        title
    });
    if(skill) res.status(400).json({
        message: "Skill with this title already exist"
    })
    else {
        const skil = await Skill.create({
            ...req.body
        })

        await skil.save();

        res.status(200).json({
            skill: skil,
            message: "success"
        })
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
.post("/multiple",  async(req: Request, res: Response) => {
    const { skills } = req.body;
    console.log("res", skills);
    try {
        skills.map(async (skills: {id: number, title: string}) => {
            const ski = await Skill.create({
                ...skills
            });
            await ski.save();
        });
    
        res.status(200).send("Upload complete!")
    } catch (error) {
        res.status(500).send(`unable to upload! - ${error}`)
    }
    
    

    // const skill = await Skill.findOne({
    //     title
    // });
    // if(skill) res.status(400).json({
    //     message: "Skill with this title already exist"
    // })
    // else {
    //     const skil = await Skill.create({
    //         ...req.body
    //     })

    //     await skil.save();

    //     res.status(200).json({
    //         skill: skil,
    //         message: "success"
    //     })
    // }
})



export default skillRouter;