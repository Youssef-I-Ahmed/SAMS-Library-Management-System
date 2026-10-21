import { LanguageSwitcher } from '../ui/LanguageSwitcher';
import { ThemeToggle } from '../ui/ThemeToggle';
import { UserMenu } from './UserMenu';

export function ShellControls() {
  return (
    <div className="shell-controls">
      <LanguageSwitcher />
      <ThemeToggle />
      <UserMenu />
    </div>
  );
}
