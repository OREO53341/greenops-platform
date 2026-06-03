# GreenOps Platform

Plateforme SaaS de supervision et d'analyse de métriques énergétiques, construite sur une architecture microservices moderne, conteneurisée avec Docker et orchestrée avec Kubernetes.

---

## Architecture globale

```
Internet
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  NGINX Reverse Proxy (port 80)                      │
│  Routage : /api → API Gateway │ / → Frontend        │
└────────────┬──────────────────┬─────────────────────┘
             │                  │
             ▼                  ▼
    ┌──────────────┐    ┌───────────────┐
    │  API Gateway │    │   Frontend    │
    │  (Node.js)   │    │ (React+Nginx) │
    │  port 3000   │    │   port 80     │
    └──────┬───────┘    └───────────────┘
           │
     ┌─────┴──────┐
     │            │
     ▼            ▼
┌─────────┐  ┌────────────────┐
│  Auth   │  │    Metrics     │
│ Service │  │    Service     │
│  :3001  │  │    :3002       │
└────┬────┘  └───────┬────────┘
     │               │
     ▼               ▼
┌──────────┐   ┌──────────┐
│PostgreSQL│   │  Redis   │
│ :5432    │   │  :6379   │
└──────────┘   └──────────┘

Monitoring (réseau isolé) :
Prometheus :9090 → scrape tous les /metrics
Grafana    :3001 → dashboards
```

### Services

| Service | Image | Port | Rôle |
|---|---|---|---|
| nginx | nginx:1.25-alpine | 80 | Reverse proxy, point d'entrée unique |
| frontend | greenops/frontend | 80 | Interface React (SPA) |
| api-gateway | greenops/api-gateway | 3000 | Routage, rate-limiting, métriques globales |
| auth-service | greenops/auth-service | 3001 | JWT, gestion utilisateurs (PostgreSQL) |
| metrics-service | greenops/metrics-service | 3002 | Métriques énergétiques (PostgreSQL + Redis) |
| postgres | postgres:16-alpine | 5432 | Base de données persistante |
| redis | redis:7-alpine | 6379 | Cache, stockage temporaire |
| prometheus | prom/prometheus | 9090 | Collecte de métriques |
| grafana | grafana/grafana | 3001 | Dashboards de supervision |

---

## Prérequis

- **Docker** ≥ 24.0 et **Docker Compose** ≥ 2.20
- **kubectl** ≥ 1.28 (Phase 2)
- **minikube** ≥ 1.32 ou accès à un cluster Kubernetes (Phase 2)
- 4 Go de RAM disponibles minimum

---

## Phase 1 — Infrastructure Docker

### 1. Configuration initiale

```bash
# Cloner le dépôt
git clone https://github.com/votre-groupe/greenops-platform.git
cd greenops-platform

# Créer le fichier d'environnement à partir du template
cp .env.example .env

# Éditer .env et changer TOUS les mots de passe avant de lancer
# (DB_PASSWORD, REDIS_PASSWORD, JWT_SECRET, GRAFANA_PASSWORD)
```

### 2. Construction et démarrage

```bash
# Construire toutes les images et démarrer la plateforme
docker compose up --build -d

# Vérifier que tous les services sont "healthy"
docker compose ps

# Suivre les logs en temps réel
docker compose logs -f

# Logs d'un service spécifique
docker compose logs -f auth-service
```

### 3. Vérification de l'état

```bash
# Santé de chaque service
curl http://localhost/health                          # Nginx
curl http://localhost/api/auth/health                # Auth Service (via Gateway)
curl http://localhost/api/metrics/health             # Metrics Service (via Gateway)

# Prometheus cible tous les services ?
open http://localhost:9090/targets   # Navigateur
# ou
curl http://localhost:9090/api/v1/targets | python -m json.tool
```

### 4. Accès à la plateforme

| Service | URL | Identifiants |
|---|---|---|
| **Application web** | http://localhost | admin@greenops.local / Admin@GreenOps2024 |
| **Application web** | http://localhost | demo@greenops.local / Demo@GreenOps2024 |
| **Prometheus** | http://localhost:9090 | — |
| **Grafana** | http://localhost:3001 | admin / GrafanaAdmin2024 |

### 5. Commandes utiles Docker

```bash
# Arrêter la plateforme (conserver les volumes)
docker compose down

# Arrêter ET supprimer les volumes (reset complet)
docker compose down -v

# Redémarrer un service spécifique après modification
docker compose up --build -d auth-service

# Inspecter les réseaux isolés
docker network ls | grep greenops
docker network inspect greenops-platform_backend-net

# Inspecter les volumes persistants
docker volume ls | grep greenops
docker volume inspect greenops-platform_postgres-data

# Exécuter une commande dans un conteneur
docker compose exec postgres psql -U greenops -d greenops
docker compose exec redis redis-cli -a redis_secret

# Statistiques de ressources en temps réel
docker stats

# Scale d'un service (ex: 3 instances du gateway)
docker compose up --scale api-gateway=3 -d
```

### 6. Test de l'API

```bash
# Obtenir un token JWT
TOKEN=$(curl -s -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@greenops.local","password":"Admin@GreenOps2024"}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

echo "Token: $TOKEN"

# Consulter les métriques énergétiques
curl -H "Authorization: Bearer $TOKEN" http://localhost/api/metrics/energy | python -m json.tool

# Consulter le résumé
curl -H "Authorization: Bearer $TOKEN" http://localhost/api/metrics/summary | python -m json.tool

# Consulter les alertes
curl -H "Authorization: Bearer $TOKEN" http://localhost/api/metrics/alerts | python -m json.tool
```

---

## Phase 2 — Migration Kubernetes

### Prérequis

```bash
# Démarrer minikube (avec assez de ressources)
minikube start --cpus=4 --memory=8192 --driver=docker

# Activer les addons nécessaires
minikube addons enable ingress
minikube addons enable metrics-server

# Vérifier que le cluster est prêt
kubectl cluster-info
kubectl get nodes
```

### 1. Construire et charger les images dans minikube

```bash
# Pointer Docker vers le daemon minikube
eval $(minikube docker-env)

# Construire toutes les images localement
docker build -t greenops/api-gateway:latest ./backend/api-gateway
docker build -t greenops/auth-service:latest ./backend/auth-service
docker build -t greenops/metrics-service:latest ./backend/metrics-service
docker build -t greenops/frontend:latest ./frontend

# Vérifier les images disponibles dans minikube
minikube image ls | grep greenops
```

### 2. Déploiement ordonné

```bash
# Étape 1 : Namespace
kubectl apply -f k8s/namespace.yaml

# Étape 2 : Secrets (ÉDITER d'abord les valeurs base64 !)
# Encoder vos mots de passe :
echo -n "MonMotDePassePostgres" | base64
echo -n "MonJWTSecret" | base64
# Puis éditer k8s/secrets.yaml avec les valeurs encodées
kubectl apply -f k8s/secrets.yaml

# Étape 3 : ConfigMaps
kubectl apply -f k8s/configmaps.yaml

# Étape 4 : Volumes persistants
kubectl apply -f k8s/pvc.yaml

# Étape 5 : Bases de données (attendre qu'elles soient Ready)
kubectl apply -f k8s/postgres-deployment.yaml
kubectl apply -f k8s/redis-deployment.yaml
kubectl wait --for=condition=ready pod -l app=postgres -n greenops --timeout=120s
kubectl wait --for=condition=ready pod -l app=redis -n greenops --timeout=60s

# Étape 6 : Services backend
kubectl apply -f k8s/auth-service-deployment.yaml
kubectl apply -f k8s/metrics-service-deployment.yaml
kubectl wait --for=condition=ready pod -l app=auth-service -n greenops --timeout=120s
kubectl wait --for=condition=ready pod -l app=metrics-service -n greenops --timeout=120s

# Étape 7 : API Gateway
kubectl apply -f k8s/api-gateway-deployment.yaml
kubectl wait --for=condition=ready pod -l app=api-gateway -n greenops --timeout=120s

# Étape 8 : Frontend
kubectl apply -f k8s/frontend-deployment.yaml

# Étape 9 : Monitoring
kubectl apply -f k8s/prometheus-deployment.yaml
kubectl apply -f k8s/grafana-deployment.yaml

# Étape 10 : Ingress et HPA
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/hpa.yaml
```

### 3. Vérification du déploiement

```bash
# État général du namespace greenops
kubectl get all -n greenops

# État des pods (tous doivent être Running)
kubectl get pods -n greenops -w

# État des services
kubectl get services -n greenops

# État de l'ingress
kubectl get ingress -n greenops

# État des HPA (Horizontal Pod Autoscaler)
kubectl get hpa -n greenops

# Logs d'un pod
kubectl logs -l app=auth-service -n greenops --tail=50

# Décrire un pod en détail (probes, events)
kubectl describe pod -l app=api-gateway -n greenops

# Événements du namespace (utile pour le debug)
kubectl get events -n greenops --sort-by='.lastTimestamp'
```

### 4. Accès via minikube

```bash
# Récupérer l'IP minikube
minikube ip
# Ex : 192.168.49.2

# Ajouter au fichier hosts (une seule fois)
# Linux/Mac :
echo "$(minikube ip) greenops.local" | sudo tee -a /etc/hosts
# Windows (PowerShell admin) :
Add-Content C:\Windows\System32\drivers\etc\hosts "$(minikube ip) greenops.local"

# Ou utiliser le tunnel minikube
minikube tunnel
# Puis accéder à http://greenops.local

# Accès direct via port-forward (sans Ingress)
kubectl port-forward svc/frontend 8080:80 -n greenops &
kubectl port-forward svc/api-gateway 3000:3000 -n greenops &
kubectl port-forward svc/prometheus 9090:9090 -n greenops &
kubectl port-forward svc/grafana 3001:3000 -n greenops &
```

### 5. Démonstration de résilience et scaling

```bash
# ── Tuer un pod et observer le redémarrage automatique ──────────
kubectl get pods -n greenops -l app=auth-service
kubectl delete pod <nom-du-pod> -n greenops
# Kubernetes redémarre immédiatement un pod de remplacement
kubectl get pods -n greenops -l app=auth-service -w

# ── Observer le scaling automatique (HPA) ───────────────────────
# Dans un terminal : observer l'HPA
kubectl get hpa -n greenops -w

# Dans un autre terminal : simuler de la charge
kubectl run load-generator --image=busybox -n greenops -it --rm \
  --restart=Never -- /bin/sh -c \
  "while true; do wget -q -O- http://api-gateway:3000/health; done"

# ── Scale manuel d'un déploiement ────────────────────────────────
kubectl scale deployment api-gateway --replicas=5 -n greenops
kubectl get pods -n greenops -l app=api-gateway

# ── Rolling update (mise à jour sans downtime) ───────────────────
# Mettre à jour l'image (après rebuild)
kubectl set image deployment/api-gateway api-gateway=greenops/api-gateway:v2 -n greenops
kubectl rollout status deployment/api-gateway -n greenops
kubectl rollout history deployment/api-gateway -n greenops

# ── Rollback en cas de problème ──────────────────────────────────
kubectl rollout undo deployment/api-gateway -n greenops
```

### 6. Commandes de maintenance Kubernetes

```bash
# Appliquer tous les manifests d'un coup
kubectl apply -f k8s/

# Supprimer tous les objets du namespace
kubectl delete all --all -n greenops

# Supprimer le namespace complet
kubectl delete namespace greenops

# Exporter la config d'un déploiement
kubectl get deployment auth-service -n greenops -o yaml > auth-service-export.yaml

# Top des ressources consommées
kubectl top pods -n greenops
kubectl top nodes

# Vérifier les ressources allouées vs limites
kubectl describe resourcequota -n greenops
```

---

## Sécurité — Bonnes pratiques appliquées

| Pratique | Détail |
|---|---|
| **Images non-root** | Tous les conteneurs s'exécutent avec un utilisateur non-root (UID 1001 ou dédié) |
| **Multi-stage builds** | Les Dockerfiles utilisent des builds multi-stages pour minimiser la surface d'attaque |
| **Secrets Kubernetes** | Les mots de passe et JWT sont stockés dans des Secrets K8s, jamais en clair |
| **Réseaux isolés** | Les services backend communiquent sur un réseau interne (`internal: true` sous Docker) |
| **RBAC Prometheus** | Le ServiceAccount Prometheus a uniquement les permissions de lecture nécessaires |
| **Rate limiting** | L'API Gateway applique un rate-limit (500 req/15min par IP) |
| **Helmet.js** | Headers HTTP sécurisés sur tous les services Node.js |
| **Validation d'entrée** | `express-validator` valide toutes les entrées utilisateur |
| **JWT refresh tokens** | Rotation des tokens, stockage hashé en base de données |
| **securityContext K8s** | `runAsNonRoot: true`, fsGroup défini pour chaque déploiement |

---

## Monitoring — Métriques exposées

### Par l'API Gateway
- `gateway_http_requests_total` — Total des requêtes par méthode/route/status
- `gateway_http_request_duration_seconds` — Distribution des durées

### Par l'Auth Service
- `auth_login_attempts_total{status="success|failure"}` — Tentatives de connexion
- `auth_active_tokens_total` — Tokens JWT actifs

### Par le Metrics Service
- `greenops_energy_consumption_kwh{source,zone}` — Consommation en kWh
- `greenops_carbon_emissions_gco2{source,zone}` — Émissions CO2
- `greenops_renewable_energy_ratio{zone}` — Ratio énergies renouvelables
- `greenops_alerts_triggered_total{severity,type}` — Alertes déclenchées
- `greenops_energy_saved_kwh` — Énergie économisée

### Configurer Grafana

1. Accéder à Grafana : http://localhost:3001 (Docker) ou http://greenops.local/grafana (K8s)
2. Se connecter : admin / GrafanaAdmin2024
3. Ajouter une source de données Prometheus :
   - URL : `http://prometheus:9090` (Docker) ou `http://prometheus:9090` (K8s)
4. Importer un dashboard ou créer des panels avec les métriques listées ci-dessus

---

## Structure du projet

```
greenops-platform/
├── .github/workflows/ci.yml      # Pipeline CI/CD GitHub Actions
├── backend/
│   ├── api-gateway/
│   │   ├── src/index.js          # Gateway principal (proxy, rate-limit, métriques)
│   │   ├── package.json
│   │   └── Dockerfile            # Multi-stage, non-root
│   ├── auth-service/
│   │   ├── src/
│   │   │   ├── index.js          # Point d'entrée
│   │   │   ├── routes/auth.js    # Login, register, refresh, logout, me, verify
│   │   │   └── db/database.js    # Pool PostgreSQL + initialisation schema
│   │   ├── package.json
│   │   └── Dockerfile            # Multi-stage, non-root
│   └── metrics-service/
│       ├── src/index.js          # Métriques énergétiques, alertes, historique
│       ├── package.json
│       └── Dockerfile            # Multi-stage, non-root
├── frontend/
│   ├── src/
│   │   ├── App.jsx               # Router principal
│   │   ├── index.jsx             # Point d'entrée React
│   │   ├── components/
│   │   │   ├── Login.jsx         # Page de connexion
│   │   │   ├── Dashboard.jsx     # Tableau de bord principal
│   │   │   ├── MetricsChart.jsx  # Graphiques Recharts (Area, Bar, Line)
│   │   │   └── AlertsPanel.jsx   # Gestionnaire d'alertes
│   │   ├── context/AuthContext.jsx  # Contexte authentification + refresh auto
│   │   └── services/api.js       # Client Axios + intercepteurs JWT
│   ├── public/index.html
│   ├── nginx.conf                # Config Nginx pour le conteneur frontend
│   ├── package.json
│   └── Dockerfile                # Multi-stage : build React → Nginx non-root
├── nginx/nginx.conf              # Config Nginx reverse proxy global
├── monitoring/
│   └── prometheus.yml            # Config scraping Prometheus
├── k8s/
│   ├── namespace.yaml            # Namespace greenops
│   ├── secrets.yaml              # Secrets (mots de passe, JWT) — template
│   ├── configmaps.yaml           # ConfigMaps app + Prometheus + Nginx
│   ├── pvc.yaml                  # PV + PVC pour Postgres/Redis/Prometheus/Grafana
│   ├── postgres-deployment.yaml  # Déploiement + Service PostgreSQL
│   ├── redis-deployment.yaml     # Déploiement + Service Redis
│   ├── auth-service-deployment.yaml     # Déploiement + Service Auth
│   ├── metrics-service-deployment.yaml  # Déploiement + Service Metrics
│   ├── api-gateway-deployment.yaml      # Déploiement + Service Gateway
│   ├── frontend-deployment.yaml         # Déploiement + Service Frontend
│   ├── prometheus-deployment.yaml       # Déploiement + RBAC + Service Prometheus
│   ├── grafana-deployment.yaml          # Déploiement + Service Grafana
│   ├── ingress.yaml              # Ingress Controller (nginx)
│   └── hpa.yaml                  # HPA pour gateway, auth, metrics, frontend
├── docker-compose.yml            # Orchestration Docker complète
├── .env.example                  # Template de configuration
├── .gitignore
└── README.md
```

---

## Choix techniques

| Technologie | Justification |
|---|---|
| **Node.js 20 / Express** | Léger, performant pour des API REST, large écosystème |
| **JWT + Refresh Tokens** | Authentification stateless, rotation sécurisée des tokens |
| **PostgreSQL 16** | Fiabilité, ACID, JSON natif pour les logs d'audit |
| **Redis 7** | Cache en mémoire ultra-rapide, TTL natif pour les données temporaires |
| **Nginx** | Reverse proxy éprouvé, configuration déclarative, performances en production |
| **React 18 + Recharts** | SPA moderne, composants de graphiques flexibles |
| **prom-client** | Standard de facto pour exposer des métriques Prometheus en Node.js |
| **Docker multi-stage** | Images minimales (réduction de 70%+ vs image complète), surface d'attaque réduite |
| **Kubernetes HPA** | Scaling automatique basé sur CPU/mémoire, adapté aux charges variables |
| **GitHub Actions** | CI/CD intégré à GitHub, gratuit pour les repos publics, cache Docker intégré |

---

## Dépannage fréquent

### Docker

```bash
# Un service ne démarre pas
docker compose logs auth-service

# Problème de connexion à PostgreSQL
docker compose exec auth-service wget -qO- http://localhost:3001/health

# Vider le cache Docker et reconstruire
docker compose down -v
docker system prune -f
docker compose up --build -d

# Port déjà utilisé
sudo lsof -i :80
sudo lsof -i :9090
```

### Kubernetes

```bash
# Pod en état Pending
kubectl describe pod <pod-name> -n greenops
# → Vérifier les events (manque de ressources, PVC non lié, etc.)

# Pod en état CrashLoopBackOff
kubectl logs <pod-name> -n greenops --previous

# Secret mal encodé
echo "Z3JlZW5vcHM=" | base64 --decode
# Doit afficher la valeur attendue

# Ingress ne répond pas
kubectl get ingress -n greenops
minikube service list
kubectl describe ingress greenops-ingress -n greenops

# HPA ne scale pas
kubectl describe hpa api-gateway-hpa -n greenops
# Vérifier que metrics-server est actif :
kubectl top pods -n greenops
```
