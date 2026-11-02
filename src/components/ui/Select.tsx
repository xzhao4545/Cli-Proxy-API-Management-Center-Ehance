import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type AriaAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { IconChevronDown, IconSearch } from './icons';
import styles from './Select.module.scss';
import { resolveDropdownStyle } from './selectPosition';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  options: ReadonlyArray<SelectOption>;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** 作用于挂到 body 的下拉层。 */
  dropdownClassName?: string;
  dropdownMinWidth?: number;
  disabled?: boolean;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  ariaInvalid?: AriaAttributes['aria-invalid'];
  fullWidth?: boolean;
  size?: 'sm' | 'md';
  id?: string;
  /** Show a search input inside the dropdown and filter options by it. */
  searchable?: boolean;
  /** Placeholder shown in the dropdown search input. Defaults to ariaLabel or 'Filter…'. */
  searchPlaceholder?: string;
  /** Rendered when the search term matches no options. Defaults to 'No matches'. */
  noOptionsText?: string;
}

export function Select({
  value,
  options,
  onChange,
  placeholder,
  className,
  dropdownClassName,
  dropdownMinWidth,
  disabled = false,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  ariaInvalid,
  fullWidth = true,
  size = 'md',
  id,
  searchable = false,
  searchPlaceholder,
  noOptionsText,
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const listboxId = `${selectId}-listbox`;
  const searchInputId = `${selectId}-search`;
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [searchText, setSearchText] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties | null>(null);
  const isOpen = open && !disabled;

  useEffect(() => {
    if (!open || disabled) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [disabled, open]);

  const updateDropdownStyle = useCallback(() => {
    if (!wrapRef.current) return;
    setDropdownStyle(
      resolveDropdownStyle(
        wrapRef.current.getBoundingClientRect(),
        window.innerWidth,
        window.innerHeight,
        dropdownMinWidth
      )
    );
  }, [dropdownMinWidth]);

  const scheduleDropdownStyleUpdate = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      updateDropdownStyle();
    });
  }, [updateDropdownStyle]);

  useLayoutEffect(() => {
    if (!isOpen) {
      if (rafRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    updateDropdownStyle();

    const handleViewportChange = () => {
      scheduleDropdownStyleUpdate();
    };

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' && wrapRef.current
        ? new ResizeObserver(() => {
            scheduleDropdownStyleUpdate();
          })
        : null;

    if (resizeObserver && wrapRef.current) {
      resizeObserver.observe(wrapRef.current);
    }

    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
      resizeObserver?.disconnect();
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isOpen, scheduleDropdownStyleUpdate, updateDropdownStyle]);

  const selectedIndex = useMemo(() => options.findIndex((option) => option.value === value), [options, value]);
  const trimmedSearch = searchable ? searchText.trim().toLocaleLowerCase() : '';
  const visibleOptions = useMemo(() => {
    if (trimmedSearch === '') return options.slice();
    return options.filter(
      (option) =>
        option.label.toLocaleLowerCase().includes(trimmedSearch) ||
        option.value.toLocaleLowerCase().includes(trimmedSearch)
    );
  }, [options, trimmedSearch]);
  const visibleSelectedIndex = useMemo(
    () => visibleOptions.findIndex((option) => option.value === value),
    [visibleOptions, value]
  );
  const resolvedHighlightedIndex =
    highlightedIndex >= 0
      ? (highlightedIndex < visibleOptions.length ? highlightedIndex : visibleOptions.length - 1)
      : visibleSelectedIndex >= 0
        ? visibleSelectedIndex
        : visibleOptions.length > 0
          ? 0
          : -1;
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const displayText = selected?.label ?? placeholder ?? '';
  const isPlaceholder = !selected && placeholder;

  const commitSelection = useCallback(
    (nextIndex: number) => {
      const nextOption = visibleOptions[nextIndex];
      if (!nextOption) return;
      onChange(nextOption.value);
      setOpen(false);
      setSearchText('');
      setHighlightedIndex(nextIndex);
      triggerRef.current?.focus({ preventScroll: true });
    },
    [onChange, visibleOptions]
  );

  const moveHighlight = useCallback(
    (direction: 1 | -1) => {
      const count = visibleOptions.length;
      if (count === 0) return;
      const nextIndex = (resolvedHighlightedIndex + direction + count) % count;
      setHighlightedIndex(nextIndex);
    },
    [visibleOptions.length, resolvedHighlightedIndex]
  );

  const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchText(event.target.value);
    setHighlightedIndex(0);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setSearchText('');
      return;
    }
    if (searchable) {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
  }, [isOpen, searchable]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          if (!isOpen) {
            setOpen(true);
            return;
          }
          moveHighlight(1);
          return;
        case 'ArrowUp':
          event.preventDefault();
          if (!isOpen) {
            setOpen(true);
            return;
          }
          moveHighlight(-1);
          return;
        case 'Home':
          if (!isOpen || visibleOptions.length === 0) return;
          // In searchable mode Home/End edit the search text.
          if (searchable) return;
          event.preventDefault();
          setHighlightedIndex(0);
          return;
        case 'End':
          if (!isOpen || visibleOptions.length === 0) return;
          if (searchable) return;
          event.preventDefault();
          setHighlightedIndex(visibleOptions.length - 1);
          return;
        case 'Enter':
        case ' ': {
          event.preventDefault();
          if (!isOpen) {
            setOpen(true);
            return;
          }
          if (resolvedHighlightedIndex >= 0) {
            commitSelection(resolvedHighlightedIndex);
          }
          return;
        }
        case 'Escape':
          if (!isOpen) return;
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          setSearchText('');
          triggerRef.current?.focus({ preventScroll: true });
          return;
        case 'Tab':
          if (isOpen) {
            setOpen(false);
            setSearchText('');
          }
          return;
        default:
          return;
      }
    },
    [commitSelection, disabled, isOpen, moveHighlight, searchable, visibleOptions.length, resolvedHighlightedIndex]
  );

  const handleSearchKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      // Let text editing keys (incl. Space) reach the input; keep Arrow/Home/End/Enter/Escape.
      if (event.key === ' ') return;
      handleKeyDown(event as unknown as React.KeyboardEvent<HTMLButtonElement>);
    },
    [handleKeyDown]
  );

  useEffect(() => {
    if (!isOpen || resolvedHighlightedIndex < 0) return;
    const highlightedOption = document.getElementById(
      `${selectId}-option-${resolvedHighlightedIndex}`
    );
    highlightedOption?.scrollIntoView({ block: 'nearest' });
  }, [isOpen, resolvedHighlightedIndex, selectId]);

  const searchPlaceholderText = searchPlaceholder ?? ariaLabel ?? 'Filter…';
  const noOptionsLabel = noOptionsText ?? 'No matches';

  const dropdown =
    isOpen && dropdownStyle
      ? (
          <div
            ref={dropdownRef}
            className={`${styles.dropdown} ${dropdownClassName ?? ''}`.trim()}
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            style={dropdownStyle}
          >
            {searchable ? (
              <div className={styles.searchWrap}>
                <IconSearch size={13} className={styles.searchIcon} aria-hidden="true" />
                <input
                  ref={searchInputRef}
                  id={searchInputId}
                  type="text"
                  className={styles.searchInput}
                  value={searchText}
                  placeholder={searchPlaceholderText}
                  onChange={handleSearchChange}
                  onKeyDown={handleSearchKeyDown}
                  autoComplete="off"
                  spellCheck={false}
                  aria-label={searchPlaceholderText}
                />
              </div>
            ) : null}
            {visibleOptions.length > 0 ? (
              visibleOptions.map((opt, index) => {
                const active = opt.value === value;
                const highlighted = index === resolvedHighlightedIndex;
                return (
                  <button
                    key={opt.value}
                    id={`${selectId}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`${styles.option} ${active ? styles.optionActive : ''} ${highlighted ? styles.optionHighlighted : ''}`.trim()}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onKeyDown={handleKeyDown}
                    onClick={() => commitSelection(index)}
                  >
                    {opt.label}
                  </button>
                );
              })
            ) : (
              <div className={styles.noOptions} role="status">
                {noOptionsLabel}
              </div>
            )}
          </div>
        )
      : null;

  return (
    <>
      <div
        className={`${styles.wrap} ${fullWidth ? styles.wrapFullWidth : ''} ${className ?? ''}`}
        ref={wrapRef}
      >
        <button
          id={selectId}
          ref={triggerRef}
          type="button"
          className={`${styles.trigger} ${size === 'sm' ? styles.triggerSm : ''}`.trim()}
          onClick={disabled ? undefined : () => setOpen((prev) => !prev)}
          onKeyDown={handleKeyDown}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listboxId : undefined}
          aria-activedescendant={
            isOpen && resolvedHighlightedIndex >= 0
              ? `${selectId}-option-${resolvedHighlightedIndex}`
              : undefined
          }
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          disabled={disabled}
        >
          <span className={`${styles.triggerText} ${isPlaceholder ? styles.placeholder : ''}`}>
            {displayText}
          </span>
          <span className={styles.triggerIcon} aria-hidden="true">
            <IconChevronDown size={14} />
          </span>
        </button>
      </div>
      {dropdown &&
        (typeof document === 'undefined' ? dropdown : createPortal(dropdown, document.body))}
    </>
  );
}
