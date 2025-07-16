import { apiRequest } from "@/lib/queryClient";
import { verificationRequestSchema, verificationResponseSchema, type VerificationRequest, type VerificationResponse } from "@shared/schema";

export async function verifyDatabaseMigration(request: VerificationRequest): Promise<VerificationResponse> {
  // Validate the request
  const validatedRequest = verificationRequestSchema.parse(request);
  
  // Make the API call
  const response = await apiRequest("POST", "/api/verify", validatedRequest);
  const data = await response.json();
  
  // Validate the response
  return verificationResponseSchema.parse(data);
}
