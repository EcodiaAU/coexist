@echo off
SET PROJECT_REF=tjutlbzekfouwsiaplbr
SET FUNCTIONS=create-checkout stripe-webhook delete-user delete-user-data data-export generate-pdf send-push send-email send-campaign generate-email event-day-notify event-reminders notify-application notify-report

echo Deploying %FUNCTIONS: =, % to %PROJECT_REF%
echo.
FOR %%F IN (%FUNCTIONS%) DO (
    echo %%F...
    npx supabase functions deploy %%F --no-verify-jwt --project-ref %PROJECT_REF% >nul 2>&1 && (
        echo   ok
    ) || (
        echo   FAILED
    )
)
echo.
echo Done.
