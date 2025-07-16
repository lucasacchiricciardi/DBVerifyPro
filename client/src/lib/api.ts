import { apiRequest } from "./queryClient";
import { type VerificationRequest, type VerificationResult } from "@shared/schema";

export async function verifyMigration(request: VerificationRequest): Promise<VerificationResult> {
  const response = await apiRequest("POST", "/api/verify", request);
  return response.json();
}
