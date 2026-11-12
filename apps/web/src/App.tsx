import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
import { Loading } from './components/common';
import { HomePage } from './pages/Home';

const CharactersPage = lazy(() => import('./pages/Characters').then((m) => ({ default: m.CharactersPage })));
const CharacterDetailPage = lazy(() => import('./pages/CharacterDetail').then((m) => ({ default: m.CharacterDetailPage })));
const ItemsPage = lazy(() => import('./pages/Items').then((m) => ({ default: m.ItemsPage })));
const ItemDetailPage = lazy(() => import('./pages/ItemDetail').then((m) => ({ default: m.ItemDetailPage })));
const TrinketDetailPage = lazy(() => import('./pages/ItemDetail').then((m) => ({ default: m.TrinketDetailPage })));
const ConsumableDetailPage = lazy(() => import('./pages/ItemDetail').then((m) => ({ default: m.ConsumableDetailPage })));
const SynergiesPage = lazy(() => import('./pages/Synergies').then((m) => ({ default: m.SynergiesPage })));
const BuildSimulatorPage = lazy(() => import('./pages/BuildSimulator').then((m) => ({ default: m.BuildSimulatorPage })));
const UnlocksPage = lazy(() => import('./pages/Unlocks').then((m) => ({ default: m.UnlocksPage })));
const AchievementDetailPage = lazy(() => import('./pages/Unlocks').then((m) => ({ default: m.AchievementDetailPage })));
const PlannerPage = lazy(() => import('./pages/Planner').then((m) => ({ default: m.PlannerPage })));
const GuidesPage = lazy(() => import('./pages/Guides').then((m) => ({ default: m.GuidesPage })));
const GuideDetailPage = lazy(() => import('./pages/Guides').then((m) => ({ default: m.GuideDetailPage })));
const BossesPage = lazy(() => import('./pages/Bosses').then((m) => ({ default: m.BossesPage })));
const BossDetailPage = lazy(() => import('./pages/Bosses').then((m) => ({ default: m.BossDetailPage })));
const FloorsPage = lazy(() => import('./pages/Floors').then((m) => ({ default: m.FloorsPage })));
const FloorDetailPage = lazy(() => import('./pages/Floors').then((m) => ({ default: m.FloorDetailPage })));
const DonationsPage = lazy(() => import('./pages/Donations').then((m) => ({ default: m.DonationsPage })));
const ProfilePage = lazy(() => import('./pages/Profile').then((m) => ({ default: m.ProfilePage })));
const AboutPage = lazy(() => import('./pages/About').then((m) => ({ default: m.AboutPage })));
const NotFoundPage = lazy(() => import('./pages/About').then((m) => ({ default: m.NotFoundPage })));

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route
          path="*"
          element={
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route path="personnages" element={<CharactersPage />} />
                <Route path="personnages/:slug" element={<CharacterDetailPage />} />
                <Route path="objets" element={<ItemsPage />} />
                <Route path="objets/:id" element={<ItemDetailPage />} />
                <Route path="trinkets/:id" element={<TrinketDetailPage />} />
                <Route path="consommables/:slug" element={<ConsumableDetailPage />} />
                <Route path="synergies" element={<SynergiesPage />} />
                <Route path="simulateur" element={<BuildSimulatorPage />} />
                <Route path="succes" element={<UnlocksPage />} />
                <Route path="succes/:id" element={<AchievementDetailPage />} />
                <Route path="planificateur" element={<PlannerPage />} />
                <Route path="guides" element={<GuidesPage />} />
                <Route path="guides/:slug" element={<GuideDetailPage />} />
                <Route path="boss" element={<BossesPage />} />
                <Route path="boss/:slug" element={<BossDetailPage />} />
                <Route path="etages" element={<FloorsPage />} />
                <Route path="etages/:slug" element={<FloorDetailPage />} />
                <Route path="dons" element={<DonationsPage />} />
                <Route path="profil" element={<ProfilePage />} />
                <Route path="a-propos" element={<AboutPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          }
        />
      </Route>
    </Routes>
  );
}
