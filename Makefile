SHELL := /usr/bin/env bash

# Load base .env
ifneq (,$(wildcard .env))
    include .env
endif

# Optional override: .${NETWORK}.env (e.g., .preprod.env)
ifneq (,$(wildcard .$(NETWORK).env))
    include .$(NETWORK).env
endif

export

# Get network-specific compose file
export COMPOSE_FILE = docker/docker-compose.${NETWORK}.yml

TLS_DIR := ../scripts/$(NETWORK)/tls
TLS_CERT := $(TLS_DIR)/hydraCert.pem
TLS_KEY := $(TLS_DIR)/hydraKey.pem

# List of make commands
HYDRA_TARGETS := up down logs restart status stats check-hydra-keys gen-hydra-keys gen-cardano-keys gen-trp-config gen-tls-cert check-tls-cert

.PHONY: $(HYDRA_TARGETS)
#.SILENT: $(HYDRA_TARGETS)

up: check-hydra-keys check-tls-cert gen-trp-config
	docker compose up -d

down:
	docker compose down

reset:
	$(MAKE) down && \
	sudo rm -rf scripts/${NETWORK}/hydra/* && \
	$(MAKE) up

logs:
	docker compose logs -f --tail=100

restart:
	$(MAKE) down && $(MAKE) up

rebuild:
	docker compose build --no-cache --pull && \
	$(MAKE) up

status:
	docker compose ps

stats:
	docker stats $$(docker compose ps --services | xargs -I {} docker compose ps -q {})

check-hydra-keys:
	@if [ "$(NETWORK)" != "offline" ]; then \
		KEY_PATH="scripts/$(NETWORK)/keys/${NODE_ID}.hydra.sk"; \
		if [ ! -f "$$KEY_PATH" ]; then \
			echo "❌ Hydra keys not found at $$KEY_PATH"; \
			echo "👉 Please generate keys before proceeding:"; \
			echo "   make NETWORK=$(NETWORK) gen-hydra-keys"; \
			exit 1; \
		else \
			echo "✅ Found Hydra key: $$KEY_PATH"; \
		fi \
	else \
		echo "🧪 Offline mode — skipping Hydra key check."; \
	fi

gen-hydra-keys:
	@if [ -z "$(NETWORK)" ]; then \
		echo "❌ NETWORK is not set. Please run with:"; \
		echo "   make NETWORK=<network> gen-hydra-keys"; \
		exit 1; \
	fi
	@echo "🔐 Generating Hydra keys for network: $(NETWORK)"
	docker compose -f "docker/docker-compose.keys.yml" run hydra-key-gen

gen-cardano-keys:
	@if [ -z "$(NETWORK)" ]; then \
    		echo "❌ NETWORK is not set. Please run with:"; \
    		echo "   make NETWORK=<network> gen-hydra-keys"; \
    		exit 1; \
	fi
	@echo "🔐 Generating Cardano keys for network: $(NETWORK)"
	docker compose -f "docker/docker-compose.keys.yml" run cardano-key-gen

gen-trp-config:
	@echo "Generating TRP config for network=$(NETWORK)..."
	@./scripts/generate-trp-config.sh

gen-tls-cert:
	@if [ -z "$(NETWORK)" ]; then \
	  echo "❌ NETWORK is not set. Example: make NETWORK=preprod gen-cert"; \
	  exit 1; \
	fi
	@echo "Preparing to generate self-signed cert for network=$(NETWORK)..."
	@mkdir -p $(TLS_DIR)
	@if [ -f "$(TLS_CERT)" ] && [ -f "$(TLS_KEY)" ]; then \
	  echo "⚠️  TLS cert and key already exist at:"; \
	  echo "    cert: $(TLS_CERT)"; \
	  echo "    key:  $(TLS_KEY)"; \
	  echo "    Skipping generation to avoid overwrite."; \
	else \
	  echo "Generating new self-signed cert in $(TLS_DIR)..."; \
	  openssl req -x509 -nodes -days 365 \
	    -newkey rsa:4096 \
	    -keyout $(TLS_KEY) \
	    -out $(TLS_CERT) \
	    -subj "/CN=localhost" \
	    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"; \
	  echo "✅ Created cert: $(TLS_CERT)"; \
	  echo "✅ Created key:  $(TLS_KEY)"; \
	fi

.PHONY: check-tls-cert
check-tls-cert:
	@if [ -z "$(NETWORK)" ]; then \
	  echo "❌ NETWORK is not set. Example: make NETWORK=preprod check-tls-cert"; \
	  exit 1; \
	fi
	@if [[ "${USE_TLS}" == "1" || "${USE_TLS,,}" == "true" ]]; then \
	  if [ ! -f "$(TLS_CERT)" ] || [ ! -f "$(TLS_KEY)" ]; then \
	    echo "❌ USE_TLS is enabled but TLS cert/key are missing."; \
	    echo "   Expected cert: $(TLS_CERT)"; \
	    echo "   Expected key:  $(TLS_KEY)"; \
	    echo "👉 Run: make NETWORK=$(NETWORK) gen-tls-cert"; \
	    exit 1; \
	  else \
	    echo "✅ TLS is enabled and certificate + key exist."; \
	  fi; \
	else \
	  echo "ℹ️  USE_TLS is not enabled; skipping TLS cert presence check."; \
	fi