import { Request, Response, Router } from "express";
import Support from "../schema/supportSchema";
import { authentication } from "../middleware/authentication";
import { requireAdminKey } from "../middleware/adminAuth";

const supportRouter = Router();

supportRouter
.get("/", authentication, requireAdminKey, async (_req: Request, res: Response) => {
  try {
    const allSupport = await Support.find();

    res.status(200).json({
      support: allSupport,
      message: "success",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `unable to get supports, ${error}`,
    });
  }
})
.get("/by-user/:user_id", authentication, async (req: Request, res: Response) => {
  const { user_id } = req.params;
  const user = (req as any).user;

  if (user._id.toString() !== user_id) {
    return res.status(403).json({ message: "Unauthorized" });
  }

  try {
    const supportMessages = await Support.find({ user_id });

    res.status(200).json({
      support: supportMessages,
      message: "success",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `unable to get support, ${error}`,
    });
  }
})
.get("/:id", authentication, requireAdminKey, async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const support = await Support.findById(id);

    if (!support) {
      return res.status(404).json({
        message: "No support message with this id exist",
      });
    }

    res.status(200).json({
      support,
      message: "success",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `unable to get support, ${error}`,
    });
  }
})
.post("/", async (req: Request, res: Response) => {
  try {
    const support = await Support.create({
      ...req.body,
    });

    res.status(200).json({
      message: "success, your response has been saved",
      support,
    });
  } catch (error: any) {
    console.log("err", error.response);

    res.status(500).send(`Unable to save your response - ${error}`);
  }
})
.delete("/:id", authentication, requireAdminKey, async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const support = await Support.findById(id);

    if (!support) {
      return res.status(404).json({
        message: "No support with this id exist",
      });
    }

    await support.deleteOne();

    res.status(200).json({
      message: "success",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `unable to delete this support, ${error}`,
    });
  }
});

export default supportRouter;
