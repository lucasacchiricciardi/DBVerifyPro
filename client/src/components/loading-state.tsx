import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export default function LoadingState() {
  const { t } = useTranslation();
  
  return (
    <Card className="border border-gray-200 shadow-sm">
      <CardContent className="p-8">
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <div className="text-center">
            <h3 className="text-lg font-medium text-gray-900">{t('verification.verifying')}</h3>
            <p className="text-gray-600 mt-1">{t('verification.subtitle')}</p>
          </div>
          <div className="w-full max-w-md">
            <Progress value={45} className="h-2" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
