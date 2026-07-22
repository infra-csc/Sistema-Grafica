import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2 items-center">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900">Página não encontrada</h1>
          </div>

          <p className="mt-4 text-sm text-gray-600">
            O endereço que você tentou acessar não existe ou foi movido.
          </p>

          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 transition-colors"
          >
            <Home className="h-4 w-4" />
            Voltar ao início
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
