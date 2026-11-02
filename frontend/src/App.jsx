import WalletConnection from "./components/WalletConnection.jsx";
import PlatformStatus from "./components/PlatformStatus.jsx";
import ContributionForm from "./components/ContributionForm.jsx";
import GovernanceDashboard from "./components/GovernanceDashboard.jsx";

export default function App() {
  return (
    <main
      style={{
        maxWidth: "1000px",
        margin: "40px auto",
        padding: "24px",
      }}
    >
      <h1>Notre plateforme de crowdfunding</h1>

      <WalletConnection />

      <hr style={{ margin: "32px 0" }} />

      <PlatformStatus />

      <hr style={{ margin: "32px 0" }} />

      <ContributionForm />

      <hr style={{ margin: "32px 0" }} />

      <GovernanceDashboard />
    </main>
  );
}