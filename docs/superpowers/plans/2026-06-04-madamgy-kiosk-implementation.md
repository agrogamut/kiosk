# MadamGy Kiosk — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a medical kiosk PWA where patients register, initiate video consultations with doctors, and receive printed prescriptions — all self-hosted on a $4/mo VPS.

**Architecture:** pnpm monorepo — Express + Socket.io server with Prisma + PostgreSQL + Redis + MinIO + LiveKit; React + Vite PWA for kiosk (patient), doctor dashboard, and admin panel. BullMQ handles doctor queue assignment and async PDF generation. All WebRTC via LiveKit SFU.

**Tech Stack:** Express, Socket.io, Prisma, PostgreSQL 16, Redis 7, BullMQ, LiveKit, MinIO, @react-pdf/renderer, tiptap, React 18, Vite, shadcn/ui, Tailwind, zustand, @tanstack/react-query, react-to-print, vitest, supertest.

**Spec:** `docs/superpowers/specs/2026-06-03-madamgy-kiosk-design.md`

---

## Status: See spec for full design. Plan written below.

This plan has 16 tasks across 5 phases (Foundation, Consultation+Video, Prescription+PDF+Print, Admin+Wallet, Hosting+CI).

Full plan content written in companion file due to size constraints.
