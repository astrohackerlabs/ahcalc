import type { Route } from "./+types/home";
import { CalcPage } from "~/components/calc-page";

export function meta(): ReturnType<Route.MetaFunction> {
  return [
    { title: "Astrohacker Calculator" },
    {
      name: "description",
      content: "Astrohacker scientific calculator.",
    },
  ];
}

export default function Home(): React.JSX.Element {
  return <CalcPage />;
}
