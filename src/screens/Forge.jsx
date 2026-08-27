// src/screens/Forge.jsx
import { useState, useRef, useEffect } from "react";
import styled, { keyframes } from "styled-components";
import { theme } from "../theme";
import { generateStories } from "../components/services/claudeService";
import {
  uploadDocument,
  deleteDocument,
  retrieveContext,
  getConfig,
} from "../components/services/ragService";

// ─── Animations ───────────────────────────────────────────
const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const spin = keyframes`
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
`;

const blink = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
`;

const pulse = keyframes`
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
`;

const glow = keyframes`
  0%, 100% { box-shadow: 0 0 20px ${theme.colors.primaryGlow}; }
  50% { box-shadow: 0 0 30px ${theme.colors.primaryGlow}; }
`;

// ─── Layout ───────────────────────────────────────────────
const PageWrapper = styled.div`
  margin-left: 240px;
  min-height: 100vh;
  background: ${theme.colors.background};
  animation: ${fadeInUp} 0.4s ease;
  overflow-x: hidden;

  @media (max-width: ${theme.breakpoints.mobile}) {
    margin-left: 0;
    padding-bottom: 80px;
  }
`;

const TopBar = styled.header`
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  height: 64px;
  padding: 0 ${theme.spacing.lg};
  background: color-mix(in srgb, ${theme.colors.surface} 85%, transparent);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid ${theme.colors.outlineVariant};
  gap: ${theme.spacing.sm};
`;

const TopBarLeft = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  flex: 1;
  min-width: 0;
  overflow: hidden;

  .title {
    font-size: ${theme.fontSizes.xl};
    font-weight: 800;
    color: ${theme.colors.onSurface};
    white-space: nowrap;
  }

  .sep {
    color: ${theme.colors.outline};
    flex-shrink: 0;
  }

  .sub {
    font-size: ${theme.fontSizes.md};
    color: ${theme.colors.onSurfaceVariant};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    .sep,
    .sub {
      display: none;
    }
  }
`;

const TopBarRight = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.md};
  flex-shrink: 0;

  @media (max-width: ${theme.breakpoints.mobile}) {
    gap: ${theme.spacing.xs};
  }
`;

const GeneratingBadge = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  padding: 6px ${theme.spacing.md};
  background: ${theme.colors.surfaceContainer};
  border-radius: ${theme.radii.sm};
  font-size: ${theme.fontSizes.xs};
  font-weight: 700;
  color: ${theme.colors.onSurfaceVariant};
  letter-spacing: 0.08em;
  text-transform: uppercase;

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${theme.colors.primary};
    animation: ${pulse} 1.5s ease-in-out infinite;
    flex-shrink: 0;
  }

  .badge-text {
    @media (max-width: ${theme.breakpoints.mobile}) {
      display: none;
    }
  }
`;

const IconBtn = styled.button`
  background: none;
  border: none;
  color: ${theme.colors.onSurfaceVariant};
  cursor: pointer;
  padding: 6px;
  border-radius: ${theme.radii.sm};
  transition: all 0.2s;
  display: flex;
  align-items: center;

  .icon {
    font-family: "Material Symbols Outlined";
    font-size: 22px;
  }

  &:hover {
    color: ${theme.colors.primary};
    background: ${theme.colors.surfaceContainerHighest};
  }
`;

const Content = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  padding: ${theme.spacing.xl};
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: ${theme.spacing.xl};

  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 1fr;
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    padding: ${theme.spacing.md};
    gap: ${theme.spacing.lg};
  }
`;

// ─── Left Column ──────────────────────────────────────────
const LeftColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};
  min-width: 0;
`;

const PromptSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const SectionLabel = styled.label`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  font-size: ${theme.fontSizes.xs};
  font-weight: 700;
  color: ${theme.colors.primary};
  letter-spacing: 0.1em;
  text-transform: uppercase;

  .icon {
    font-family: "Material Symbols Outlined";
    font-size: 16px;
    font-variation-settings:
      "FILL" 1,
      "wght" 400,
      "GRAD" 0,
      "opsz" 24;
  }

  .version {
    margin-left: auto;
    font-size: ${theme.fontSizes.xs};
    color: ${theme.colors.onSurfaceVariant};
    font-weight: 500;
    letter-spacing: 0;
    text-transform: none;
  }
`;

const TextareaWrapper = styled.div`
  position: relative;
`;

const StyledTextarea = styled.textarea`
  width: 100%;
  min-height: 200px;
  padding: ${theme.spacing.lg};
  padding-bottom: 48px;
  background: ${theme.colors.surfaceContainerHigh};
  border: 2px solid
    ${({ $disabled }) =>
      $disabled ? theme.colors.outlineVariant : theme.colors.outlineVariant};
  border-radius: ${theme.radii.xl};
  font-size: ${theme.fontSizes.lg};
  font-family: ${theme.fonts.sans};
  color: ${({ $disabled }) =>
    $disabled ? theme.colors.onSurfaceVariant : theme.colors.onSurface};
  resize: vertical;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
  cursor: ${({ $disabled }) => ($disabled ? "not-allowed" : "text")};
  opacity: ${({ $disabled }) => ($disabled ? 0.7 : 1)};

  &::placeholder {
    color: ${theme.colors.onSurfaceVariant};
    opacity: 0.5;
  }

  &:focus {
    border-color: ${({ $disabled }) =>
      $disabled ? theme.colors.outlineVariant : theme.colors.primary};
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    min-height: 160px;
    font-size: ${theme.fontSizes.md};
  }
`;

const TextareaFooter = styled.div`
  position: absolute;
  bottom: ${theme.spacing.md};
  left: ${theme.spacing.lg};
  right: ${theme.spacing.lg};
  display: flex;
  justify-content: space-between;
  align-items: center;
  pointer-events: none;
`;

const KbdHint = styled.span`
  font-size: ${theme.fontSizes.xs};
  color: ${theme.colors.onSurfaceVariant};
  background: ${theme.colors.surfaceContainerHigh};
  padding: 3px 8px;
  border-radius: 6px;
  border: 1px solid ${theme.colors.outlineVariant};
`;

const CharCount = styled.span`
  font-size: ${theme.fontSizes.xs};
  color: ${({ $over }) =>
    $over ? theme.colors.error : theme.colors.onSurfaceVariant};
  background: ${theme.colors.surfaceContainerHigh};
  padding: 3px 8px;
  border-radius: 6px;
`;

const RestoreHint = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  margin-bottom: ${theme.spacing.sm};
  background: color-mix(in srgb, ${theme.colors.primary} 8%, transparent);
  border: 1px solid color-mix(in srgb, ${theme.colors.primary} 20%, transparent);
  border-radius: ${theme.radii.sm};
  color: ${theme.colors.primary};
  font-size: ${theme.fontSizes.xs};
  .material-symbols-outlined {
    font-size: 16px;
  }
`;

const RagToggleBar = styled.div`
  display: flex;
  justify-content: flex-end;
`;

const RagToggleRow = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: ${theme.colors.onSurface};
  font-size: ${theme.fontSizes.xs};
  font-weight: 600;
  cursor: pointer;
  user-select: none;

  input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .track {
    position: relative;
    display: inline-block;
    flex-shrink: 0;
    width: 36px;
    height: 20px;
    border-radius: ${theme.radii.full};
    background: ${theme.colors.surfaceBright};
    border: 1px solid ${theme.colors.onSurfaceVariant};
    transition: background 0.2s;

    &::after {
      content: "";
      position: absolute;
      top: 1px;
      left: 1px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: ${theme.colors.onSurface};
      transition: left 0.2s, background 0.2s;
    }
  }

  input:checked + .track {
    background: ${theme.colors.primary};
  }

  input:checked + .track::after {
    left: 17px;
    background: ${theme.colors.onPrimary};
  }
`;

const GenerateBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.md} ${theme.spacing.xl};
  border-radius: ${theme.radii.lg};
  border: none;
  background: ${({ $disabled }) =>
    $disabled ? theme.colors.surfaceContainerHighest : theme.colors.primary};
  color: ${({ $disabled }) =>
    $disabled ? theme.colors.onSurfaceVariant : theme.colors.onPrimary};
  font-weight: 700;
  font-size: ${theme.fontSizes.md};
  cursor: ${({ $disabled }) => ($disabled ? "not-allowed" : "pointer")};
  transition: all 0.2s;
  width: 100%;
  animation: ${({ $loading }) => ($loading ? "none" : "none")};

  &:hover:not(:disabled) {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  &:active:not(:disabled) {
    transform: scale(0.98);
  }

  .icon {
    font-family: "Material Symbols Outlined";
    font-size: 20px;
    animation: ${({ $loading }) => ($loading ? spin : "none")} 1.5s linear
      infinite;
  }
`;

const InfoBanner = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.md};
  background: ${theme.colors.surfaceContainer};
  border: 1px solid ${theme.colors.outlineVariant};
  border-radius: ${theme.radii.lg};
  font-size: ${theme.fontSizes.sm};
  color: ${theme.colors.onSurfaceVariant};

  .icon {
    font-family: "Material Symbols Outlined";
    font-size: 18px;
    color: ${theme.colors.primary};
    flex-shrink: 0;
    margin-top: 1px;
  }

  strong {
    color: ${theme.colors.onSurface};
  }
`;

// ─── RAG Context Panel ────────────────────────────────────
const RAGPanel = styled.div`
  border-left: 3px solid ${theme.colors.primary};
  background: ${theme.colors.surface};
  border-radius: 0 ${theme.radii.lg} ${theme.radii.lg} 0;
  padding: ${theme.spacing.lg};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const RAGHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;

  .left {
    display: flex;
    align-items: center;
    gap: ${theme.spacing.sm};
    font-size: ${theme.fontSizes.xl};
    font-weight: 700;
    color: ${theme.colors.onSurface};

    .icon {
      font-family: "Material Symbols Outlined";
      font-size: 20px;
      color: ${theme.colors.primary};
    }
  }

  .toggle {
    background: none;
    border: none;
    color: ${theme.colors.onSurfaceVariant};
    cursor: pointer;
    font-family: "Material Symbols Outlined";
    font-size: 20px;
    transition: transform 0.2s;
    transform: ${({ $open }) => ($open ? "rotate(180deg)" : "rotate(0deg)")};
  }
`;

const SourcePills = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const SourcePill = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: color-mix(in srgb, ${theme.colors.primary} 8%, transparent);
  border: 1px solid color-mix(in srgb, ${theme.colors.primary} 18%, transparent);
  border-radius: 999px;
  font-size: 11px;
  color: ${theme.colors.onSurface};
  max-width: 200px;

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: ${theme.colors.success};
    flex-shrink: 0;
  }

  .name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

// ─── Streaming Result ─────────────────────────────────────
const StreamingCard = styled.div`
  background: ${theme.colors.surfaceContainer};
  border: 2px solid ${theme.colors.primary};
  border-radius: ${theme.radii.xl};
  padding: ${theme.spacing.lg};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};
  animation: ${glow} 2s ease-in-out infinite;
  position: relative;
  overflow: hidden;
`;

const StreamingBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${theme.colors.primary};
  background: color-mix(in srgb, ${theme.colors.primary} 8%, transparent);
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, ${theme.colors.primary} 20%, transparent);

  .spin-icon {
    font-family: "Material Symbols Outlined";
    font-size: 14px;
    animation: ${spin} 1.5s linear infinite;
  }
`;

const StreamingText = styled.div`
  font-size: ${theme.fontSizes.md};
  color: ${theme.colors.onSurface};
  line-height: 1.8;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: break-word;
  font-family: ${theme.fonts.sans};

  h2,
  h3 {
    color: ${theme.colors.primary};
    margin: 16px 0 8px;
    font-size: ${theme.fontSizes.md};
  }

  strong {
    color: ${theme.colors.onSurface};
    font-weight: 700;
  }

  code {
    display: block;
    background: ${theme.colors.surfaceContainerLowest};
    border-left: 3px solid ${theme.colors.primary};
    padding: ${theme.spacing.md};
    border-radius: 4px;
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.sm};
    color: ${theme.colors.onSurfaceVariant};
    margin: ${theme.spacing.sm} 0;
    white-space: pre-wrap;
  }
`;

const Cursor = styled.span`
  display: inline-block;
  width: 2px;
  height: 1.1em;
  background: ${theme.colors.primary};
  margin-left: 2px;
  vertical-align: middle;
  animation: ${blink} 1s step-end infinite;
`;

// ─── Empty State ──────────────────────────────────────────
const EmptyState = styled.div`
  border: 2px dashed ${theme.colors.outlineVariant};
  border-radius: ${theme.radii.xl};
  padding: ${theme.spacing["3xl"]};
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: ${theme.spacing.md};
  opacity: 0.5;

  .icon {
    font-family: "Material Symbols Outlined";
    font-size: 40px;
    color: ${theme.colors.onSurfaceVariant};
  }

  p {
    font-size: ${theme.fontSizes.md};
    color: ${theme.colors.onSurfaceVariant};
    line-height: 1.5;
  }
`;

// ─── Right Column — Knowledge Base ────────────────────────
const RightColumn = styled.div`
  min-width: 0;

  @media (max-width: ${theme.breakpoints.tablet}) {
    order: -1;
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    order: 2;
  }
`;

const KBPanel = styled.div`
  background: ${theme.colors.surfaceContainerLow};
  border: 1px solid ${theme.colors.outlineVariant};
  border-radius: ${theme.radii.xl};
  padding: ${theme.spacing.lg};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};
  position: sticky;
  top: 80px;

  @media (max-width: ${theme.breakpoints.tablet}) {
    position: static;
  }
`;

const KBHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;

  .left {
    display: flex;
    align-items: center;
    gap: ${theme.spacing.sm};
    font-size: ${theme.fontSizes.xl};
    font-weight: 700;
    color: ${theme.colors.onSurface};
  }

  .indexed-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: ${theme.fontSizes.xs};
    font-weight: 700;
    color: ${theme.colors.textSuccess};
    background: ${theme.colors.bgSuccess};
    border: 1px solid color-mix(in srgb, ${theme.colors.success} 35%, transparent);
    padding: 4px 10px;
    border-radius: ${theme.radii.sm};

    .icon {
      font-family: "Material Symbols Outlined";
      font-size: 14px;
    }
  }
`;

const KBSubtitle = styled.p`
  font-size: ${theme.fontSizes.sm};
  color: ${theme.colors.onSurfaceVariant};
  line-height: 1.5;
  margin-top: -${theme.spacing.sm};
`;

const DocList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
  max-height: 280px;
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 4px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: ${theme.colors.surfaceContainerHighest};
    border-radius: 999px;
  }
`;

const DocCard = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.md};
  background: ${theme.colors.surfaceContainer};
  border: 1px solid ${theme.colors.outlineVariant};
  border-radius: ${theme.radii.md};
  transition: border-color 0.2s;

  &:hover {
    border-color: color-mix(in srgb, ${theme.colors.primary} 30%, transparent);
  }

  .doc-icon {
    font-family: "Material Symbols Outlined";
    font-size: 20px;
    color: ${({ $status }) =>
      $status === "indexed"
        ? theme.colors.primary
        : $status === "loading"
          ? theme.colors.tertiary
          : theme.colors.outline};
    flex-shrink: 0;
    margin-top: 2px;
  }

  .doc-info {
    flex: 1;
    min-width: 0;

    .name {
      font-size: ${theme.fontSizes.sm};
      font-weight: 600;
      color: ${theme.colors.onSurface};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;

      a {
        color: inherit;
        text-decoration: none;
        &:hover {
          text-decoration: underline;
        }
      }
    }

    .status {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      margin-top: 4px;
      color: ${({ $status }) =>
        $status === "indexed"
          ? theme.colors.textSuccess
          : $status === "loading"
            ? theme.colors.primary
            : theme.colors.error};
    }
  }

  .chunks-badge {
    font-size: 10px;
    font-weight: 700;
    color: ${theme.colors.textSuccess};
    background: ${theme.colors.bgSuccess};
    border: 1px solid color-mix(in srgb, ${theme.colors.success} 35%, transparent);
    padding: 3px 8px;
    border-radius: 6px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .percent {
    font-size: ${theme.fontSizes.sm};
    font-weight: 700;
    color: ${theme.colors.primary};
    flex-shrink: 0;
  }
`;

const ProgressBar = styled.div`
  height: 3px;
  background: ${theme.colors.surfaceContainerHighest};
  border-radius: 999px;
  overflow: hidden;
  margin-top: 6px;

  .fill {
    height: 100%;
    background: ${theme.colors.primary};
    border-radius: 999px;
    width: ${({ $pct }) => $pct}%;
    transition: width 0.5s ease;
  }
`;

const UploadZone = styled.div`
  border: 2px dashed ${theme.colors.outlineVariant};
  border-radius: ${theme.radii.lg};
  padding: ${theme.spacing.xl};
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: ${theme.spacing.sm};
  cursor: pointer;
  transition: all 0.2s;
  background: ${({ $dragOver }) =>
    $dragOver ? `color-mix(in srgb, ${theme.colors.primary} 5%, transparent)` : "transparent"};
  border-color: ${({ $dragOver }) =>
    $dragOver ? theme.colors.primary : theme.colors.outlineVariant};

  ${({ $disabled }) =>
    $disabled &&
    `
    opacity: 0.45;
    cursor: not-allowed;
    pointer-events: none;
  `}

  &:hover {
    border-color: color-mix(in srgb, ${theme.colors.primary} 40%, transparent);
    background: color-mix(in srgb, ${theme.colors.primary} 3%, transparent);
  }

  .upload-icon {
    font-family: "Material Symbols Outlined";
    font-size: 32px;
    color: ${theme.colors.outline};
    transition: color 0.2s;
  }

  &:hover .upload-icon {
    color: ${theme.colors.primary};
  }

  .upload-title {
    font-size: ${theme.fontSizes.sm};
    font-weight: 600;
    color: ${theme.colors.onSurface};
  }

  .upload-sub {
    font-size: 11px;
    color: ${theme.colors.onSurfaceVariant};
  }

  .format-badges {
    display: flex;
    gap: ${theme.spacing.sm};
    margin-top: 4px;
  }

  .format-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 4px;
    background: ${theme.colors.surfaceContainerHighest};
    color: ${theme.colors.onSurfaceVariant};
    border: 1px solid ${theme.colors.outlineVariant};
  }
`;

const DeleteDocBtn = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: ${theme.radii.sm};
  color: ${theme.colors.outline};
  font-family: "Material Symbols Outlined";
  font-size: 18px;
  line-height: 1;
  flex-shrink: 0;
  transition:
    color 0.2s,
    background 0.2s;

  &:hover {
    color: ${theme.colors.error};
    background: ${theme.colors.bgError};
  }
`;

const IndexBtn = styled.button`
  width: 100%;
  padding: ${theme.spacing.md};
  border-radius: ${theme.radii.lg};
  border: 1px solid ${theme.colors.outlineVariant};
  background: transparent;
  color: ${theme.colors.onSurfaceVariant};
  font-size: ${theme.fontSizes.sm};
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: ${theme.colors.surfaceContainerHighest};
    color: ${theme.colors.onSurface};
    border-color: color-mix(in srgb, ${theme.colors.primary} 30%, transparent);
  }
`;

// ─── Demo Chips ───────────────────────────────────────────
const DemoContext = styled.p`
  font-size: ${theme.fontSizes.sm};
  color: ${theme.colors.onSurfaceVariant};
  line-height: 1.5;
  margin: 0;

  strong {
    color: ${theme.colors.onSurface};
  }
`;

const ModeHint = styled.p`
  font-size: ${theme.fontSizes.sm};
  color: ${theme.colors.onSurface};
  line-height: 1.6;
  margin: 0;
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  background: color-mix(in srgb, ${theme.colors.primary} 6%, transparent);
  border-left: 2px solid color-mix(in srgb, ${theme.colors.primary} 30%, transparent);
  border-radius: 0 ${theme.radii.sm} ${theme.radii.sm} 0;

  strong {
    font-weight: 700;
  }
`;

const ChipRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.sm};
`;

const Chip = styled.button`
  padding: 6px 14px;
  border-radius: ${theme.radii.full};
  border: 1px solid ${theme.colors.outlineVariant};
  background: ${theme.colors.surfaceContainerHigh};
  color: ${theme.colors.onSurface};
  font-size: ${theme.fontSizes.sm};
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  max-width: 100%;
  white-space: normal;
  text-align: left;

  &:hover {
    border-color: ${theme.colors.primary};
    color: ${theme.colors.primary};
    background: color-mix(in srgb, ${theme.colors.primary} 6%, transparent);
  }

  &:active {
    transform: scale(0.97);
  }
`;

// ─── Error / Copy ─────────────────────────────────────────
const ConfirmBanner = styled.div`
  background: ${theme.colors.bgWarning};
  border: 1px solid color-mix(in srgb, ${theme.colors.amber} 30%, transparent);
  border-radius: ${theme.radii.lg};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  font-size: ${theme.fontSizes.sm};
  color: ${theme.colors.onSurface};

  .message {
    margin-bottom: ${theme.spacing.sm};
  }

  .filename {
    font-weight: 600;
  }

  .actions {
    display: flex;
    gap: ${theme.spacing.sm};
  }

  button {
    padding: 4px 12px;
    border-radius: ${theme.radii.md};
    font-size: ${theme.fontSizes.xs};
    font-weight: 600;
    cursor: pointer;
    border: none;
  }

  .btn-replace {
    background: ${theme.colors.primary};
    color: ${theme.colors.onPrimary};
  }

  .btn-cancel {
    background: ${theme.colors.surfaceContainerHighest};
    color: ${theme.colors.onSurfaceVariant};
  }
`;

// ─── Suppression de document ────────────────────────────────
const DeleteModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: ${theme.colors.scrim};
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${theme.spacing.md};
  z-index: 100;
`;

const DeleteModal = styled.div`
  width: 100%;
  max-width: 380px;
  background: ${theme.colors.surfaceContainer};
  border: 1px solid ${theme.colors.outlineVariant};
  border-radius: ${theme.radii.xl};
  padding: ${theme.spacing.xl};
  box-shadow: ${theme.shadows.card};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};

  .title {
    font-size: ${theme.fontSizes.lg};
    font-weight: 700;
    color: ${theme.colors.onSurface};
  }

  .doc-name {
    font-size: ${theme.fontSizes.md};
    font-weight: 600;
    color: ${theme.colors.onSurface};
    word-break: break-word;
  }

  .chunks {
    font-size: ${theme.fontSizes.sm};
    color: ${theme.colors.onSurfaceVariant};
  }

  .consequence {
    font-size: ${theme.fontSizes.sm};
    color: ${theme.colors.onSurfaceVariant};
    margin-bottom: ${theme.spacing.sm};
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: ${theme.spacing.sm};
  }

  button {
    padding: 8px 16px;
    border-radius: ${theme.radii.md};
    font-size: ${theme.fontSizes.sm};
    font-weight: 700;
    cursor: pointer;
    border: none;
  }

  .btn-cancel {
    background: ${theme.colors.surfaceContainerHighest};
    color: ${theme.colors.onSurfaceVariant};
  }

  .btn-delete {
    background: ${theme.colors.error};
    color: ${theme.colors.onPrimary};
  }
`;

// Toast fixe (pas un bandeau inline dans le KBPanel) : la suppression se
// confirme via une modale centrée plein écran, l'attention de l'utilisateur
// est donc déjà au centre — un message de succès planqué dans la colonne de
// droite (et repoussé sous le contenu principal en mobile, cf. RightColumn
// `order: 2`) passait inaperçu. Réutilise fadeInUp (déjà utilisé sur
// PageWrapper) plutôt que d'introduire une nouvelle animation.
const DeleteSuccessToast = styled.div`
  position: fixed;
  top: ${theme.spacing.lg};
  left: 50%;
  transform: translateX(-50%);
  z-index: 60;
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  background: ${theme.colors.bgSuccess};
  border: 1px solid color-mix(in srgb, ${theme.colors.success} 30%, transparent);
  border-radius: ${theme.radii.lg};
  padding: ${theme.spacing.sm} ${theme.spacing.lg};
  color: ${theme.colors.textSuccess};
  font-size: ${theme.fontSizes.sm};
  font-weight: 700;
  box-shadow: ${theme.shadows.card};
  animation: ${fadeInUp} 0.3s ease;

  .icon {
    font-family: "Material Symbols Outlined";
    font-size: 20px;
  }
`;

const ErrorMsg = styled.div`
  background: ${theme.colors.bgError};
  border: 1px solid color-mix(in srgb, ${theme.colors.error} 30%, transparent);
  border-radius: ${theme.radii.lg};
  padding: ${theme.spacing.md};
  color: ${theme.colors.textError};
  font-size: ${theme.fontSizes.sm};
  display: flex;
  justify-content: space-between;
  align-items: center;

  button {
    background: none;
    border: none;
    color: ${theme.colors.textError};
    cursor: pointer;
    font-size: 18px;
  }
`;

const ResultActions = styled.div`
  display: flex;
  gap: ${theme.spacing.md};
  justify-content: flex-end;
`;

const CopyBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: ${theme.radii.md};
  border: 1px solid ${theme.colors.outlineVariant};
  color: ${theme.colors.primary};
  background: ${({ $copied }) =>
    $copied ? `color-mix(in srgb, ${theme.colors.primary} 15%, transparent)` : "transparent"};
  border-color: ${({ $copied }) =>
    $copied ? theme.colors.primary : theme.colors.outlineVariant};
  font-size: ${theme.fontSizes.sm};
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  .icon {
    font-family: "Material Symbols Outlined";
    font-size: 16px;
  }

  &:hover {
    border-color: ${theme.colors.primary};
  }
`;

// ─── Demo briefs ──────────────────────────────────────────
const DEMO_BRIEFS = [
  {
    label: "Gérer les retours produits",
    text: "En tant que responsable SAV de Lumeo Boutique, je veux pouvoir gérer les demandes de retour produit des clients : accepter ou refuser la demande selon notre politique de retour, et déclencher le remboursement dès réception du colis.",
  },
  {
    label: "Tableau de bord des litiges SAV",
    text: "En tant que responsable SAV de Lumeo Boutique, je veux un tableau de bord centralisant tous les litiges ouverts (retards de livraison, produits endommagés, non-conformités), avec des filtres par statut, ancienneté et montant, afin de prioriser les traitements et réduire notre délai de résolution moyen.",
  },
  {
    label: "Paiement fractionné Alma",
    text: "En tant que client de Lumeo Boutique, je veux pouvoir régler mes achats en plusieurs fois via Alma, afin de faciliter l'achat de luminaires à prix élevé. L'option doit s'afficher au checkout à partir d'un certain montant de panier, avec un retour visuel clair sur les échéances.",
  },
  {
    label: "Suivi des livraisons et stock fournisseurs",
    text: "En tant que gestionnaire logistique de Lumeo Boutique, je veux suivre en temps réel l'état des livraisons en cours et les niveaux de stock fournisseurs, afin d'anticiper les ruptures, mettre à jour automatiquement la disponibilité sur le site et informer les clients des délais estimés.",
  },
];

// ─── Component ────────────────────────────────────────────
export default function Forge({
  onNavigate,
  brief,
  setBrief,
  stories,
  setStories,
  ragChunks,
  setRagChunks,
  documents,
  setDocuments,
  setTruncated,
  keepBrief = false,
  onClearKeepBrief,
  themeMode,
  onThemeChange,
}) {
  const [status, setStatus] = useState("idle"); // 'idle' | 'loading' | 'success' | 'error'
  const [error, setError] = useState(null);
  const [ragDisabled, setRagDisabled] = useState(false);
  const [ragOpen, setRagOpen] = useState(true);
  const [uploadError, setUploadError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [pendingReplaceFiles, setPendingReplaceFiles] = useState([]);
  const [pendingDeleteDoc, setPendingDeleteDoc] = useState(null);
  const [deleteSuccessMessage, setDeleteSuccessMessage] = useState(null);
  // Fail-closed : reste verrouillé tant que /api/config n'a pas répondu, pour ne
  // jamais laisser l'UI d'upload s'afficher active à un visiteur de la démo
  // publique pendant le chargement.
  const [demoMode, setDemoMode] = useState(true);
  const fileInputRef = useRef(null);
  const documentsRef = useRef(documents);
  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);

  useEffect(() => {
    getConfig()
      .then(({ demoMode }) => setDemoMode(demoMode))
      .catch((err) => {
        console.warn("[config] Échec du chargement de la configuration, upload resté verrouillé :", err);
      });
  }, []);

  useEffect(() => {
    if (!deleteSuccessMessage) return;
    const timer = setTimeout(() => setDeleteSuccessMessage(null), 3500);
    return () => clearTimeout(timer);
  }, [deleteSuccessMessage]);

  const charCount = brief.length;
  const MAX = 2000;

  useEffect(() => {
    if (status === "success" && stories) {
      onNavigate("results");
    }
  }, [status, stories]);

  const handleSubmit = async () => {
    if (!brief.trim() || status === "loading") return;
    onClearKeepBrief?.();
    setStories("");
    setError(null);
    setStatus("loading");
    setRagChunks([]);
    setTruncated?.(false);

    let contextChunks = [];

    if (!ragDisabled) {
      try {
        const ragResult = await retrieveContext(brief);
        contextChunks = ragResult.chunks || [];
        setRagChunks(contextChunks);
      } catch (err) {
        console.warn("RAG retrieval failed, generating without context:", err);
      }
    }

    let hasError = false;

    await generateStories(
      brief,
      (chunk) => setStories((prev) => prev + chunk),
      (errMsg) => {
        hasError = true;
        setError(errMsg);
        setStatus("error");
      },
      contextChunks,
      () => setTruncated?.(true),
    );

    if (!hasError) setStatus("success");
  };

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleSubmit();
  };

  const handleFileUpload = async (files) => {
    for (const file of files) {
      const alreadyIndexed = documentsRef.current.some(
        (d) => d.name === file.name && d.status === "indexed",
      );
      if (alreadyIndexed) {
        setPendingReplaceFiles((prev) => [...prev, file]);
        continue;
      }
      await uploadSingleFile(file);
    }
  };

  const uploadSingleFile = async (file) => {
    try {
      setUploadError(null);
      const newDoc = {
        id: Date.now(),
        name: file.name,
        size: file.size,
        status: "loading",
        pct: 0,
        chunks: 0,
      };
      setDocuments((prev) => [newDoc, ...prev]);

      const result = await uploadDocument(file, (pct) => {
        setDocuments((prev) =>
          prev.map((d) => (d.name === file.name ? { ...d, pct } : d)),
        );
      });

      setDocuments((prev) =>
        prev.map((d) =>
          d.name === file.name
            ? { ...d, status: "indexed", chunks: result.chunks, pct: 100 }
            : d,
        ),
      );
    } catch (err) {
      if (import.meta.env.DEV) console.error("uploadDocument failed:", err);
      setDocuments((prev) =>
        prev.map((d) => (d.name === file.name ? { ...d, status: "error" } : d)),
      );
      setUploadError(err.message);
    }
  };

  const handleConfirmReplace = async () => {
    const [file, ...rest] = pendingReplaceFiles;
    setPendingReplaceFiles(rest);
    setDocuments((prev) => prev.filter((d) => d.name !== file.name));
    await uploadSingleFile(file);
  };

  const handleCancelReplace = () => setPendingReplaceFiles((prev) => prev.slice(1));

  const handleDeleteDoc = (doc) => setPendingDeleteDoc(doc);

  const handleCancelDelete = () => setPendingDeleteDoc(null);

  const handleConfirmDelete = async () => {
    const doc = pendingDeleteDoc;
    setPendingDeleteDoc(null);
    try {
      await deleteDocument(doc.name);
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      setDeleteSuccessMessage("Document supprimé de la base de connaissance.");
    } catch (err) {
      setUploadError(err.message);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    handleFileUpload(files);
  };

  return (
    <PageWrapper>
      <TopBar>
        <TopBarLeft>
          <span className="title">Brief</span>
          <span className="sep">/</span>
          <span className="sub">Génération</span>
        </TopBarLeft>
        <TopBarRight>
          {status === "loading" && (
            <GeneratingBadge>
              <span className="dot" />
              <span className="badge-text">Génération en cours...</span>
            </GeneratingBadge>
          )}
          <IconBtn
            onClick={() => onThemeChange?.(themeMode === "dark" ? "light" : "dark")}
            title={themeMode === "dark" ? "Passer en thème clair" : "Passer en thème sombre"}
          >
            <span
              className="icon"
              style={{ fontVariationSettings: '"FILL" 1, "wght" 400, "GRAD" 0, "opsz" 24' }}
            >
              {themeMode === "dark" ? "light_mode" : "dark_mode"}
            </span>
          </IconBtn>
          <IconBtn>
            <span className="icon">notifications</span>
          </IconBtn>
        </TopBarRight>
      </TopBar>

      <Content>
        {/* ── Left Column ── */}
        <LeftColumn>
          <PromptSection>
            <ModeHint>
              <strong>Démo Lumeo Boutique</strong> — e-commerce fictif de déco / luminaires.<br />
              Les documents sont pré-chargés et utilisés automatiquement. Utilisez les suggestions ci-dessous ou décrivez un besoin lié aux commandes, retours, livraison ou SAV.
              <br /><br />
              <em>En production, chaque entreprise importe ses propres documents (politiques internes, catalogues, process métier) pour des stories ancrées dans son contexte réel.</em>
              <br /><br />
              <em>Si le brief s'éloigne du contexte Lumeo Boutique, la récupération ne trouve rien de pertinent et les stories sortent génériques automatiquement. Pour forcer ce comportement volontairement, même sur un brief pertinent (pour comparer), active le toggle "Générer sans RAG" ci-dessous.</em>
            </ModeHint>

            <ChipRow>
              {DEMO_BRIEFS.map((b) => (
                <Chip
                  key={b.label}
                  type="button"
                  onClick={() => setBrief(b.text)}
                >
                  {b.label}
                </Chip>
              ))}
            </ChipRow>

            <RagToggleBar>
              <RagToggleRow>
                <input
                  type="checkbox"
                  checked={ragDisabled}
                  onChange={(e) => setRagDisabled(e.target.checked)}
                />
                <span className="track" />
                Générer sans RAG (US génériques)
              </RagToggleRow>
            </RagToggleBar>

            <TextareaWrapper>
              <StyledTextarea
                placeholder="Décris ton besoin métier ici... (Ctrl+Entrée pour soumettre)"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                onKeyDown={handleKeyDown}
                $disabled={status === "loading"}
                disabled={status === "loading"}
              />
              <TextareaFooter>
                <KbdHint>⌘ + Enter</KbdHint>
                <CharCount $over={charCount > MAX}>
                  {charCount} / {MAX}
                </CharCount>
              </TextareaFooter>
            </TextareaWrapper>

            {keepBrief && status === "idle" && (
              <RestoreHint>
                <span className="material-symbols-outlined">info</span>
                Brief précédent restauré — cliquez sur Générer pour relancer.
              </RestoreHint>
            )}

            <GenerateBtn
              onClick={handleSubmit}
              $disabled={
                !brief.trim() || status === "loading" || charCount > MAX
              }
              $loading={status === "loading"}
              disabled={
                !brief.trim() || status === "loading" || charCount > MAX
              }
            >
              <span className="icon">
                {status === "loading" ? "sync" : "auto_awesome"}
              </span>
              {status === "loading"
                ? "Génération en cours..."
                : "Générer les user stories"}
            </GenerateBtn>

            <InfoBanner>
              <span className="icon">info</span>
              <span>
                <strong>Budget limité :</strong> démo $5/mois (~660
                générations). Si la limite est atteinte, une erreur s'affichera.
              </span>
            </InfoBanner>
          </PromptSection>

          {/* Error */}
          {error && (
            <ErrorMsg>
              <span>{error}</span>
              <button onClick={() => setError(null)}>✕</button>
            </ErrorMsg>
          )}

          {/* RAG Sources Panel — visible pendant génération */}
          {status === "loading" && ragChunks.length > 0 && (
            <RAGPanel>
              <RAGHeader $open={ragOpen}>
                <div className="left">
                  <span className="icon">search</span>
                  Sources utilisées
                </div>
                <button className="toggle" onClick={() => setRagOpen(!ragOpen)}>
                  expand_more
                </button>
              </RAGHeader>
              {ragOpen && (
                <SourcePills>
                  {[...new Set(ragChunks.map((c) => c.filename))].map(
                    (filename) => (
                      <SourcePill key={filename}>
                        <span className="dot" />
                        <span className="name" title={filename}>
                          {filename}
                        </span>
                      </SourcePill>
                    ),
                  )}
                </SourcePills>
              )}
            </RAGPanel>
          )}

          {/* Streaming Result */}
          {status === "loading" && stories && (
            <StreamingCard>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <StreamingBadge>
                  <span className="spin-icon">sync_saved_locally</span>
                  Streaming Result
                </StreamingBadge>
              </div>
              <StreamingText>
                {stories}
                <Cursor />
              </StreamingText>
            </StreamingCard>
          )}

          {/* Empty state */}
          {status !== "loading" && !stories && (
            <EmptyState>
              <span className="icon">description</span>
              <p>
                Les user stories générées apparaîtront ici.
                <br />
                Commencez par décrire votre projet.
              </p>
            </EmptyState>
          )}
        </LeftColumn>

        {/* ── Right Column — Knowledge Base ── */}
        <RightColumn>
          <KBPanel>
            <KBHeader>
              <div className="left">
                <span>🗂️ Base de connaissance</span>
              </div>
              {documents.filter((d) => d.status === "indexed").length > 0 && (
                <span className="indexed-badge">
                  <span className="icon">check_circle</span>
                  {documents.filter((d) => d.status === "indexed").length}{" "}
                  indexé
                  {documents.filter((d) => d.status === "indexed").length > 1
                    ? "s"
                    : ""}
                </span>
              )}
            </KBHeader>

            <KBSubtitle>
              Les passages pertinents sont récupérés automatiquement à la
              génération.
            </KBSubtitle>

            <DocList>
              {documents.map((doc) => (
                <DocCard key={doc.id} $status={doc.status}>
                  <span className="doc-icon">
                    {doc.status === "indexed"
                      ? "description"
                      : doc.status === "loading"
                        ? "picture_as_pdf"
                        : "article"}
                  </span>
                  <div className="doc-info">
                    <p className="name">
                      {doc.status === "indexed" ? (
                        <a
                          href={`/docs/${doc.name}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {doc.name}
                        </a>
                      ) : (
                        doc.name
                      )}
                    </p>
                    <p className="status">
                      {doc.status === "indexed"
                        ? `✓ ${doc.chunks} chunks`
                        : doc.status === "loading"
                          ? "Chunking en cours..."
                          : "NON INDEXÉ"}
                    </p>
                    {doc.status === "loading" && (
                      <ProgressBar $pct={doc.pct}>
                        <div className="fill" />
                      </ProgressBar>
                    )}
                  </div>
                  {doc.status === "indexed" && (
                    <span className="chunks-badge">✓ {doc.chunks} chunks</span>
                  )}
                  {doc.status === "loading" && (
                    <span className="percent">{doc.pct}%</span>
                  )}
                  {doc.status !== "loading" && (
                    <DeleteDocBtn
                      disabled={demoMode}
                      title={
                        demoMode
                          ? "Suppression désactivée en mode démo — pour préserver l'expérience des autres visiteurs."
                          : `Supprimer ${doc.name}`
                      }
                      onClick={demoMode ? undefined : () => handleDeleteDoc(doc)}
                      style={demoMode ? { opacity: 0.35, cursor: "not-allowed" } : undefined}
                    >
                      delete
                    </DeleteDocBtn>
                  )}
                </DocCard>
              ))}
            </DocList>

            {pendingReplaceFiles.length > 0 && (
              <ConfirmBanner>
                <p className="message">
                  <span className="filename">{pendingReplaceFiles[0].name}</span>{" "}
                  est déjà indexé. Remplacer ?
                </p>
                <div className="actions">
                  <button
                    className="btn-replace"
                    onClick={handleConfirmReplace}
                  >
                    Remplacer
                  </button>
                  <button className="btn-cancel" onClick={handleCancelReplace}>
                    Annuler
                  </button>
                </div>
              </ConfirmBanner>
            )}

            {uploadError && (
              <ErrorMsg>
                <span>{uploadError}</span>
                <button onClick={() => setUploadError(null)}>✕</button>
              </ErrorMsg>
            )}

            {demoMode ? (
              <UploadZone $disabled>
                <span className="upload-icon">cloud_upload</span>
                <p className="upload-title">
                  Upload désactivé en mode démo publique
                </p>
                <p className="upload-sub">
                  La base de connaissance (8 documents fictifs sur Lumeo Boutique)
                  est pré-configurée pour cette démo.
                </p>
              </UploadZone>
            ) : (
              <UploadZone
                $dragOver={dragOver}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const files = Array.from(e.target.files);
                    handleFileUpload(files);
                  }}
                />
                <span className="upload-icon">cloud_upload</span>
                <p className="upload-title">Glissez vos docs ici</p>
                <p className="upload-sub">ou cliquez pour parcourir — Max 10 Mo</p>
                <div className="format-badges">
                  <span className="format-badge">PDF</span>
                  <span className="format-badge">DOCX</span>
                  <span className="format-badge">TXT</span>
                </div>
              </UploadZone>
            )}

            {demoMode && (
              <IndexBtn
                disabled
                title="Indexation désactivée en mode démo — pour préserver l'expérience des autres visiteurs."
                style={{ opacity: 0.35, cursor: "not-allowed" }}
              >
                Indexer les documents
              </IndexBtn>
            )}
          </KBPanel>
        </RightColumn>
      </Content>

      {deleteSuccessMessage && (
        <DeleteSuccessToast role="status">
          <span className="icon">check_circle</span>
          {deleteSuccessMessage}
        </DeleteSuccessToast>
      )}

      {pendingDeleteDoc && (
        <DeleteModalOverlay>
          <DeleteModal>
            <span className="title">Supprimer ce document ?</span>
            <span className="doc-name">{pendingDeleteDoc.name}</span>
            <span className="chunks">{pendingDeleteDoc.chunks || 0} chunks indexés</span>
            <span className="consequence">
              Ce document ne sera plus utilisé pour générer des user stories.
            </span>
            <div className="actions">
              <button className="btn-cancel" onClick={handleCancelDelete}>
                Annuler
              </button>
              <button className="btn-delete" onClick={handleConfirmDelete}>
                Supprimer
              </button>
            </div>
          </DeleteModal>
        </DeleteModalOverlay>
      )}
    </PageWrapper>
  );
}
