import { LanguageSwitcher } from '../ui/LanguageSwitcher';
import { ThemeToggle } from '../ui/ThemeToggle';
import { UserMenu } from './UserMenu';
import { NotificationBell } from './NotificationBell';

export function ShellControls() {
  return (
    <div className="shell-controls">
      <LanguageSwitcher />
      <ThemeToggle />
      <NotificationBell />
      <UserMenu />
    </div>
  );
}
