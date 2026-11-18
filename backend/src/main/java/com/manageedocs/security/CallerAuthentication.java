package com.manageedocs.security;

import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import java.util.ArrayList;
import java.util.List;

/** Authorities = ROLE_&lt;role&gt; plus every effective {@link Permission} name. */
public class CallerAuthentication extends AbstractAuthenticationToken {

    private final AppUserDetails caller;

    public CallerAuthentication(AppUserDetails caller) {
        super(authorities(caller));
        this.caller = caller;
        setAuthenticated(true);
    }

    private static List<GrantedAuthority> authorities(AppUserDetails c) {
        List<GrantedAuthority> list = new ArrayList<>(c.permissions().size() + 1);
        list.add(new SimpleGrantedAuthority(c.role().authority()));
        c.permissions().forEach(p -> list.add(new SimpleGrantedAuthority(p.name())));
        return list;
    }

    @Override
    public Object getCredentials() {
        return null;
    }

    @Override
    public AppUserDetails getPrincipal() {
        return caller;
    }

    @Override
    public String getName() {
        return caller.userId().toString();
    }
}
