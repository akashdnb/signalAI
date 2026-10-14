import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircleIcon, ChevronDownIcon, SearchIcon } from "../icons";
import "./ConnectedAccountSwitcher.css";

export type ConnectedAccountSwitcherOption = {
  id: string;
  handle: string;
  label: string;
  connected?: boolean;
};

const HEADER_HANDLE_MAX_LENGTH = 22;

function truncateAccountHandle(handle: string, maxLength = HEADER_HANDLE_MAX_LENGTH) {
  if (handle.length <= maxLength) return handle;
  return `${handle.slice(0, maxLength - 3)}...`;
}

export type ConnectedAccountSwitcherProps = {
  workspaceName: string;
  providerLabel: string;
  providerIcon: ReactNode;
  accounts: ConnectedAccountSwitcherOption[];
  selectedAccountId: string;
  onSelect: (accountId: string) => void;
  onManageAccounts?: () => void;
  previewOnly?: boolean;
};

export function ConnectedAccountSwitcher({
  workspaceName,
  providerLabel,
  providerIcon,
  accounts,
  selectedAccountId,
  onSelect,
  onManageAccounts,
  previewOnly = false,
}: ConnectedAccountSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId().replace(/:/g, "");
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? accounts[0];

  const filteredAccounts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return accounts;
    return accounts.filter((account) =>
      [account.handle, account.label, account.id].some((value) => value.toLowerCase().includes(normalizedQuery)),
    );
  }, [accounts, query]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    const dismissOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      setQuery("");
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };
    document.addEventListener("pointerdown", dismissOnOutsidePointer);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", dismissOnOutsidePointer);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [open]);

  const selectAccount = (account: ConnectedAccountSwitcherOption) => {
    onSelect(account.id);
    setOpen(false);
    setQuery("");
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const manageAccounts = () => {
    setOpen(false);
    setQuery("");
    onManageAccounts?.();
  };

  return (
    <div className="sai-account-switcher" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="sai-account-switcher__trigger"
        aria-label={`Switch ${providerLabel} account. Current account ${selectedAccount?.handle ?? "not selected"}; ${selectedAccount?.connected === false ? "disconnected" : "connected"}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`sai-account-switcher-panel-${listId}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="sai-account-switcher__provider-chip" aria-hidden="true">{providerIcon}</span>
        <span className="sai-account-switcher__identity">
          <strong>{workspaceName}</strong>
          <small className="sai-account-switcher__header-status">
            <span
              className={"sai-account-switcher__status-dot" + (selectedAccount?.connected === false || !selectedAccount ? " is-disconnected" : "")}
              aria-label={selectedAccount?.connected === false || !selectedAccount ? "Disconnected" : "Connected"}
              title={selectedAccount?.connected === false || !selectedAccount ? "Disconnected" : "Connected"}
            />
            <span className="sai-account-switcher__current-handle">
              {selectedAccount ? truncateAccountHandle(selectedAccount.handle) : "No account selected"}
            </span>
          </small>
        </span>
        <ChevronDownIcon className="sai-account-switcher__chevron" aria-hidden="true" />
      </button>

      {open && (
        <div
          id={`sai-account-switcher-panel-${listId}`}
          className="sai-account-switcher__panel"
          role="dialog"
          aria-label={`Switch connected ${providerLabel} account`}
        >
          <div className="sai-account-switcher__panel-heading">
            <div>
              <strong>{providerLabel} accounts</strong>
              <small>{accounts.length} {accounts.length === 1 ? "account" : "accounts"} available</small>
            </div>
            <span className="sai-account-switcher__provider-label">{providerLabel}</span>
          </div>

          <label className="sai-account-switcher__search">
            <SearchIcon aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              placeholder={`Search ${providerLabel.toLowerCase()} accounts`}
              aria-label={`Search connected ${providerLabel} accounts`}
              aria-controls={`sai-account-switcher-options-${listId}`}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "ArrowDown") return;
                event.preventDefault();
                rootRef.current?.querySelector<HTMLElement>('[role="option"]')?.focus();
              }}
            />
          </label>

          <div id={`sai-account-switcher-options-${listId}`} className="sai-account-switcher__options" role="listbox" aria-label={`Connected ${providerLabel} accounts`}>
            {filteredAccounts.map((account) => {
              const selected = account.id === selectedAccountId;
              const connected = account.connected !== false;
              return (
                <button
                  key={account.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={"sai-account-switcher__option" + (selected ? " is-selected" : "")}
                  onClick={() => selectAccount(account)}
                >
                  <span className="sai-account-switcher__option-icon" aria-hidden="true">{providerIcon}</span>
                  <span className="sai-account-switcher__option-copy">
                    <strong>{account.handle}</strong>
                    <small>{account.label}</small>
                    <small className={connected ? "is-connected" : "is-disconnected"}>
                      <span className="sai-account-switcher__status-dot" />
                      {connected ? "Connected" : "Needs reconnect"}
                    </small>
                  </span>
                  {selected && <CheckCircleIcon className="sai-account-switcher__selected-icon" aria-hidden="true" />}
                </button>
              );
            })}
            {filteredAccounts.length === 0 && (
              <div className="sai-account-switcher__empty" role="status">
                <strong>No matching accounts</strong>
                <small>Try another username or account name.</small>
              </div>
            )}
          </div>

          <div className="sai-account-switcher__footer">
            {previewOnly && <p>Preview selection only. This doesn’t change a live Instagram connection.</p>}
            {onManageAccounts && (
              <button type="button" className="sai-account-switcher__manage" onClick={manageAccounts}>
                Manage connected accounts <span aria-hidden="true">→</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
