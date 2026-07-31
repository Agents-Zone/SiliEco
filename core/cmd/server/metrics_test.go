package main

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/silieco-ai/silieco/core/internal/analytics"
	"github.com/silieco-ai/silieco/core/internal/events"
	"github.com/silieco-ai/silieco/core/internal/realtime"
)

func TestMainRouterDoesNotExposePrometheusMetrics(t *testing.T) {
	router := NewRouter(nil, realtime.NewHub(), events.New(), analytics.NoopClient{}, nil)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("main API /metrics status = %d, want %d", rec.Code, http.StatusNotFound)
	}
}
