import { useEffect, useRef, useState, type ComponentType } from "react";
import { Link, NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import {
  ApiError,
  api,
  clearSession,
  loadSession,
  type AccountHealth,
  type BillingSummary,
  type TenantSummary,
  type UsageSummary,
} from "../api";
import { BottomSheet } from "./BottomSheet";
import { NotificationBell } from "./NotificationBell";
import { TenantContext } from "../context/TenantContext";
import { deriveDisplayName } from "../lib/leadFormatting";
import { Logo } from "./Logo";
import { OnboardingWizard } from "./OnboardingWizard";
import { ThemeToggle } from "./ThemeToggle";
import {
  AnalyticsIcon,
  AutomationIcon,
  BookIcon,
  BroadcastIcon,
  ChevronDownIcon,
  CloseIcon,
  ContactsIcon,
  ContentIcon,
  CreditCardIcon,
  HomeIcon,
  InboxIcon,
  InstagramMarkIcon,
  IntegrationsIcon,
  LeadsIcon,
