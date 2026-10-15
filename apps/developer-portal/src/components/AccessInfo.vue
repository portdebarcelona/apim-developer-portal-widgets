<template>
  <div class="auth-info-container">
    <div class="info-card compact-card">
      <div class="info-icon small-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0M12 9v4m0 4h.01" />
        </svg>
      </div>
      <div class="info-content-row">
        <span class="info-title-inline">Acceso a las APIs:</span>
        <span class="info-text-inline">El acceso a determinadas APIs puede requerir permisos adicionales o credenciales específicas.</span>
      </div>
      <div class="info-action-row">
        <button class="request-btn small-btn" type="button" disabled title="No disponible en este momento">Solicitar acceso</button>
      </div>
    </div>
  </div>
</template>
