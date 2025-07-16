import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ErrorDisplayProps {
  error: string;
  onRetry: () => void;
}

export default function ErrorDisplay({ error, onRetry }: ErrorDisplayProps) {
  return (
    <Card className="border border-red-200 shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-start space-x-3">
          <div className="bg-red-100 rounded-full p-2">
            <AlertTriangle className="w-6 h-6 text-red-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-medium text-red-900">Connection Error</h3>
            <p className="text-red-700 mt-1">{error}</p>
            
            <Alert className="mt-4 bg-red-50 border-red-200">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                <div className="font-medium">Troubleshooting Tips:</div>
                <ul className="list-disc list-inside text-sm mt-2 space-y-1">
                  <li>Verify that the database server is running and accessible</li>
                  <li>Check that the host and port are correct</li>
                  <li>Ensure the username and password are valid</li>
                  <li>Confirm the database name exists</li>
                  <li>Check firewall settings and network connectivity</li>
                </ul>
              </AlertDescription>
            </Alert>

            <div className="mt-4">
              <Button onClick={onRetry} variant="destructive" className="flex items-center space-x-2">
                <RefreshCw className="w-4 h-4" />
                <span>Retry Connection</span>
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
