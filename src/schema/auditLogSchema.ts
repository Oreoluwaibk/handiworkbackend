import { Schema, model, Types } from "mongoose";

export interface IAuditLog {
  action: string;
  admin_id: Types.ObjectId;
  target_user_id?: Types.ObjectId;
  details?: Record<string, unknown>;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    action: { type: String, required: true },
    admin_id: { type: Schema.Types.ObjectId, ref: "user", required: true },
    target_user_id: { type: Schema.Types.ObjectId, ref: "user" },
    details: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

const AuditLog = model<IAuditLog>("AuditLog", auditLogSchema);
export default AuditLog;
