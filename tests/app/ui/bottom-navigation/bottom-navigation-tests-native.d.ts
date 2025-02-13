﻿//@private
import { BottomNavigation } from "tns-core-modules/ui/bottom-navigation";

export function getNativeTabCount(tabView: BottomNavigation): number;
export function selectNativeTab(tabView: BottomNavigation, index: number): void;
export function getNativeSelectedIndex(tabView: BottomNavigation): number;
export function getNativeFont(tabView: BottomNavigation): any;
export function getOriginalFont(tabView: BottomNavigation): any;