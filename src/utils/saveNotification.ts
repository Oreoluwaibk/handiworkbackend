import Notification from "../schema/notificationScheme"

export const saveNotifcation = async (title: string, description: string, id: any) => {
    try {
         const notification = await Notification.create({
            title,
            description,
            user_id: id
        })

        await notification.save();
        return {
            success: true,
            message: "success"
        }
    } catch (error) {
        return {
            success: false,
            message: error
        }
    }
}