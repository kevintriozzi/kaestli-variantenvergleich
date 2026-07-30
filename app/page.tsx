import CalculatorApp from "./components/calculator-app";

export default function Home() {
  return (
    <CalculatorApp
      adminSignInPath="/admin"
      isAdmin={false}
    />
  );
}
