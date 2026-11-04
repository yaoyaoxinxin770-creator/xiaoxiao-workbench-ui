"use client";
import { Suspense } from "react";
import { ProjectStudio } from "./components/project-studio";
export default function ProjectLibraryPage() { return <Suspense fallback={null}><ProjectStudio /></Suspense>; }
