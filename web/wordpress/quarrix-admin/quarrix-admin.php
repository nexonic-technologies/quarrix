<?php
/**
 * Plugin Name: Quarrix Admin
 * Description: Owner-only Quarrix account and usage dashboard. No private document contents are exposed.
 * Version: 0.2.0
 * Author: Nexonic Technologies
 */
if (!defined('ABSPATH')) exit;
function quarrix_owner_allowed() {
    return defined('QUARRIX_OWNER_ID') && (int) QUARRIX_OWNER_ID === get_current_user_id() && current_user_can('manage_options') && (!is_multisite() || is_super_admin());
}
add_action('admin_menu', function() {
    if (quarrix_owner_allowed()) add_menu_page('Quarrix', 'Quarrix', 'manage_options', 'quarrix-owner', 'quarrix_owner_page', 'dashicons-chart-area', 59);
});
add_action('admin_post_quarrix_document', function() {
    if (!quarrix_owner_allowed() || !defined('QUARRIX_ADMIN_TOKEN') || !defined('QUARRIX_API_ORIGIN') || QUARRIX_API_ORIGIN !== 'https://quarrix.nexonictechnologies.com') wp_die('Access denied.');
    check_admin_referer('quarrix_document');
    $owner = sanitize_text_field(wp_unslash($_GET['owner'] ?? '')); $doc = sanitize_text_field(wp_unslash($_GET['doc'] ?? ''));
    if (!preg_match('/^[a-f0-9-]{36}$/', $owner) || !preg_match('/^[a-f0-9-]{36}$/', $doc)) wp_die('Invalid document.');
    $response = wp_safe_remote_get(QUARRIX_API_ORIGIN.'/api/admin/support/'.$owner.'/document/'.$doc,array('headers'=>array('Authorization'=>'Bearer '.QUARRIX_ADMIN_TOKEN),'timeout'=>20,'redirection'=>0,'limit_response_size'=>2100000));
    if (is_wp_error($response) || wp_remote_retrieve_response_code($response)!==200) wp_die('Document unavailable or permission expired.');
    nocache_headers();header('Content-Type: application/octet-stream');header('Content-Disposition: attachment; filename="quarrix-document.pdf"');header('X-Content-Type-Options: nosniff');echo wp_remote_retrieve_body($response);exit;
});
function quarrix_owner_page() {
    if (!quarrix_owner_allowed()) wp_die('Access denied.');
    echo '<div class="wrap"><h1>Quarrix — Owner dashboard</h1><p>Account and usage metadata only. Resume contents and private searches are not displayed.</p>';
    if (!defined('QUARRIX_ADMIN_TOKEN') || !defined('QUARRIX_API_ORIGIN')) { echo '<p>Configure the server integration in wp-config.php.</p></div>'; return; }
    $url = rtrim(QUARRIX_API_ORIGIN, '/');
    if ($url !== 'https://quarrix.nexonictechnologies.com') { echo '<p>Invalid portal origin.</p></div>'; return; }
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['quarrix_action'])) {
        check_admin_referer('quarrix_control');
        $action = sanitize_key(wp_unslash($_POST['quarrix_action']));
        $id = sanitize_text_field(wp_unslash($_POST['account_id'] ?? ''));
        if (in_array($action, array('suspend','restore','maintenance-on','maintenance-off'), true)) {
            $change = wp_safe_remote_post($url.'/api/admin/control', array('headers'=>array('Authorization'=>'Bearer '.QUARRIX_ADMIN_TOKEN,'Content-Type'=>'application/json'), 'body'=>wp_json_encode(array('action'=>$action,'id'=>$id)), 'timeout'=>15,'redirection'=>0));
            echo '<p>'.(is_wp_error($change) || wp_remote_retrieve_response_code($change)!==200 ? 'Action failed.' : 'Action saved.').'</p>';
        }
    }
    $offset = max(0, min(100000, (int) ($_GET['offset'] ?? 0)));
    $response = wp_safe_remote_get($url . '/api/admin/overview?offset=' . $offset, array('headers'=>array('Authorization'=>'Bearer '.QUARRIX_ADMIN_TOKEN), 'timeout'=>15, 'redirection'=>0, 'limit_response_size'=>524288));
    if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) { echo '<p>Quarrix is unavailable or not connected.</p></div>'; return; }
    $data = json_decode(wp_remote_retrieve_body($response), true);
    if (!is_array($data) || !isset($data['accounts']) || !is_array($data['accounts'])) { echo '<p>Unexpected response.</p></div>'; return; }
    echo '<p>Registered accounts: '.esc_html($data['total']).' | Searches today: '.esc_html($data['searchesToday']).'</p><form method="post">';
    wp_nonce_field('quarrix_control');
    echo '<p>Portal: '.($data['maintenance']?'Maintenance':'Online').' <button class="button" name="quarrix_action" value="'.($data['maintenance']?'maintenance-off':'maintenance-on').'">'.($data['maintenance']?'Bring online':'Enable maintenance').'</button></p></form><table class="widefat striped"><thead><tr><th>Email</th><th>Joined (UTC)</th><th>Newsletter consent</th><th>Searches today</th><th>Records</th><th>Documents</th><th>Storage bytes</th><th>Account</th></tr></thead><tbody>';
    foreach ($data['accounts'] as $account) {
        echo '<tr>';
        foreach (array($account['email'].' ('.($account['verified']?'verified':'unverified').')'.($account['suspended']?' — suspended':''), gmdate('Y-m-d', (int) ($account['created']/1000)), $account['subscribed'] ? 'Opted in' : 'No', $account['searchesToday'], $account['records'], $account['documents'], $account['bytes']) as $value) echo '<td>'.esc_html($value).'</td>';
        echo '<td><form method="post">';wp_nonce_field('quarrix_control');echo '<input type="hidden" name="account_id" value="'.esc_attr($account['id']).'"><button class="button" name="quarrix_action" value="'.($account['suspended']?'restore':'suspend').'">'.($account['suspended']?'Restore':'Suspend').'</button></form><a href="'.esc_url(wp_nonce_url(admin_url('admin.php?page=quarrix-owner&support='.$account['id']), 'quarrix_support')).'">Support view</a></td></tr>';
    }
    echo '</tbody></table><p>';
    if ($offset > 0) echo '<a href="'.esc_url(admin_url('admin.php?page=quarrix-owner&offset='.max(0,$offset-100))).'">Previous</a> ';
    if ($offset+100 < $data['total']) echo '<a href="'.esc_url(admin_url('admin.php?page=quarrix-owner&offset='.($offset+100))).'">Next</a>';
    echo '</p><h2>Authorized support access</h2><p>Ask a user to enable temporary support access in their workspace. Access is logged and expires after one hour.</p>';
    $support = sanitize_text_field(wp_unslash($_GET['support'] ?? ''));
    // Opening a support view is logged on the portal, so it needs a nonce.
    if (preg_match('/^[a-f0-9-]{36}$/', $support) && wp_verify_nonce(sanitize_text_field(wp_unslash($_GET['_wpnonce'] ?? '')), 'quarrix_support')) {
        $permission = wp_safe_remote_get($url.'/api/admin/support/'.$support,array('headers'=>array('Authorization'=>'Bearer '.QUARRIX_ADMIN_TOKEN),'timeout'=>15,'redirection'=>0,'limit_response_size'=>524288));
        if (is_wp_error($permission) || wp_remote_retrieve_response_code($permission)!==200) echo '<p>No active support permission.</p>';
        else { $private = json_decode(wp_remote_retrieve_body($permission),true); foreach (($private['records'] ?? array()) as $r) echo '<p><strong>'.esc_html($r['title']).'</strong> — '.esc_html($r['kind']).'<br>'.esc_html($r['notes']).'</p>'; foreach (($private['history'] ?? array()) as $h) echo '<p>Search: '.esc_html($h['kind']).' — '.esc_html($h['query']).' · '.esc_html($h['location']).' · '.esc_html($h['count']).' results</p>'; foreach (($private['documents'] ?? array()) as $d) echo '<p><a href="'.esc_url(wp_nonce_url(admin_url('admin-post.php?action=quarrix_document&owner='.$support.'&doc='.$d['id']),'quarrix_document')).'">Download '.esc_html($d['name']).'</a></p>'; }
    }
    echo '<h2>Owner audit log</h2><p><a href="'.esc_url(admin_url('admin.php?page=quarrix-owner&audit=1')).'">Show recent actions</a></p>';
    if (isset($_GET['audit'])) { $a=wp_safe_remote_get($url.'/api/admin/audit',array('headers'=>array('Authorization'=>'Bearer '.QUARRIX_ADMIN_TOKEN),'timeout'=>15,'redirection'=>0,'limit_response_size'=>262144)); if (!is_wp_error($a)&&wp_remote_retrieve_response_code($a)===200) { $events=json_decode(wp_remote_retrieve_body($a),true); foreach (($events['events']??array()) as $event) echo '<p>'.esc_html(gmdate('Y-m-d H:i:s',(int) ($event['created']/1000))).' UTC · '.esc_html($event['action']).' · '.esc_html($event['target']).'</p>'; } }
    echo '</div>';
}
