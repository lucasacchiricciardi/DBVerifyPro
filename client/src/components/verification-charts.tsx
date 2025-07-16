import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from "react-i18next";
import type { VerificationResult, TableComparison } from '@/lib/types';

interface VerificationChartsProps {
  result: VerificationResult;
}

export default function VerificationCharts({ result }: VerificationChartsProps) {
  const { t } = useTranslation();
  const { summary, comparison } = result;

  // Data for status overview pie chart
  const statusData = [
    { name: t('results.matchedTables'), value: summary.matchedTables, color: '#10b981' },
    { name: t('results.mismatchedTables'), value: summary.mismatchedTables, color: '#ef4444' }
  ];

  // Data for row count comparison bar chart
  const rowCountData = comparison.map((table) => ({
    name: table.tableName,
    source: table.sourceRows,
    target: table.targetRows,
    status: table.status
  })).slice(0, 10); // Show top 10 tables

  // Data for schema compatibility overview
  const schemaData = comparison.reduce((acc, table) => {
    const key = table.schemaMatch ? 'Compatible' : 'Incompatible';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const schemaChartData = Object.entries(schemaData).map(([name, value]) => ({
    name: name === 'Compatible' ? t('schema.compatible', 'Compatible') : t('schema.incompatible', 'Incompatible'),
    value,
    color: name === 'Compatible' ? '#10b981' : '#f59e0b'
  }));

  // Data mapping status
  const dataMappingData = comparison.reduce((acc, table) => {
    const key = table.dataMappingValid ? 'Valid' : 'Invalid';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const dataMappingChartData = Object.entries(dataMappingData).map(([name, value]) => ({
    name: name === 'Valid' ? t('common.valid', 'Valid') : t('common.invalid', 'Invalid'),
    value,
    color: name === 'Valid' ? '#10b981' : '#ef4444'
  }));

  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text 
        x={x} 
        y={y} 
        fill="white" 
        textAnchor={x > cx ? 'start' : 'end'} 
        dominantBaseline="central"
        fontSize="12"
        fontWeight="bold"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <div className="space-y-6">
      {/* Summary Statistics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Overall Status Pie Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{t('charts.statusOverview', 'Table Status Overview')}</CardTitle>
            <CardDescription>{t('charts.statusDescription', 'Match vs Mismatch Distribution')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderCustomLabel}
                  outerRadius={70}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value, name) => [value, name]} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Schema Compatibility Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{t('charts.schemaCompatibility', 'Schema Compatibility')}</CardTitle>
            <CardDescription>{t('charts.schemaDescription', 'Structure Alignment Status')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={schemaChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderCustomLabel}
                  outerRadius={70}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {schemaChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value, name) => [value, name]} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Data Mapping Status Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{t('charts.dataMappingStatus', 'Data Mapping Status')}</CardTitle>
            <CardDescription>{t('charts.dataMappingDescription', 'Field-to-Field Validation')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={dataMappingChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderCustomLabel}
                  outerRadius={70}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {dataMappingChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value, name) => [value, name]} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Row Count Comparison Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Row Count Comparison (Top 10 Tables)</CardTitle>
          <CardDescription>Source vs Target Row Counts</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={rowCountData}
              margin={{
                top: 20,
                right: 30,
                left: 20,
                bottom: 60,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="name" 
                angle={-45}
                textAnchor="end"
                height={80}
                fontSize={12}
              />
              <YAxis />
              <Tooltip 
                formatter={(value, name) => [
                  typeof value === 'number' ? value.toLocaleString() : value, 
                  name === 'source' ? 'Source Rows' : 'Target Rows'
                ]}
                labelFormatter={(label) => `Table: ${label}`}
              />
              <Legend />
              <Bar dataKey="source" fill="#3b82f6" name="Source Rows" />
              <Bar dataKey="target" fill="#10b981" name="Target Rows" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Table Status Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Table Status Distribution</CardTitle>
          <CardDescription>Detailed breakdown by table verification status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{summary.matchedTables}</div>
              <div className="text-sm text-green-700">{t('results.matchedTables')}</div>
            </div>
            <div className="p-4 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{summary.mismatchedTables}</div>
              <div className="text-sm text-red-700">{t('results.mismatchedTables')}</div>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{summary.totalTables}</div>
              <div className="text-sm text-blue-700">{t('results.totalTables')}</div>
            </div>
            <div className="p-4 bg-purple-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">{summary.totalRows.toLocaleString()}</div>
              <div className="text-sm text-purple-700">{t('results.totalRows')}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}