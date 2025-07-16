import type { 
  VerificationResult, 
  DBConnection, 
  TableComparison, 
  VerificationRequest
} from "@shared/schema";
import { verificationRequestSchema } from "@shared/schema";

export type { VerificationResult, DBConnection, TableComparison, VerificationRequest };
export { verificationRequestSchema };

export interface FormData {
  source: DBConnection;
  target: DBConnection;
}

export interface VerificationState {
  isLoading: boolean;
  result: VerificationResult | null;
  error: string | null;
}
