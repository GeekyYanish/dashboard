/**
 * The `neo` barrel. Import primitives from here, never from the individual
 * files — it keeps the two families (neumorphic L1/L2 vs plane-level L1c)
 * visible as one design system rather than a folder of components.
 *
 * Read ./README.md before adding anything: the surface ladder and
 * "colour is data" rules are what hold the whole console together.
 */

export { NeoCard } from "./card";
export { NeoButton, NeoIconButton } from "./button";
export type { NeoButtonProps, NeoIconButtonProps } from "./button";
export {
  NeoInput,
  NeoTextarea,
  NeoSelect,
  NeoSearchField,
  NeoToggle,
  NeoCheckbox,
  NeoRadio,
  NeoSegmented,
  NeoSlider,
} from "./controls";
export {
  StatusBadge,
  ToneDot,
  LiveDot,
  NeoStatTile,
  NeoProgress,
  NeoRing,
  NeoAvatar,
  NeoSkeleton,
  KeyValue,
  EmptyState,
  SectionRule,
} from "./display";
export type { Tone } from "./display";
export {
  NeoModal,
  NeoDrawer,
  NeoPopover,
  MenuItem,
  NeoTooltip,
  TooltipProvider,
  Kbd,
} from "./overlay";
export { DataTable, Pagination } from "./data-table";
export type { Column, SortState } from "./data-table";
export { Toaster, toast } from "./toaster";
export { NeoTabs } from "./tabs";
export { NeoStepper } from "./stepper";
